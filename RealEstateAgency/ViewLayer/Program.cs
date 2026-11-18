using System.Text.Json;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using RealEstateAgency.BusinessLogicLayer;
using RealEstateAgency.IntegrationLayer;
using RealEstateAgency.PersistenceLayer;
using RealEstateAgency.PersistenceLayer.Entities;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args, WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
});
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
var postgres = builder.Configuration["Database:Provider"] == "PostgreSQL";
if (postgres)
{
    builder.Services.AddDbContext<PostgresAgencyDbContext>(options => options.UseNpgsql(
        builder.Configuration.GetConnectionString("Agency"),
        settings => settings.MigrationsHistoryTable("__EFMigrationsHistory", "agency_ef")));
    builder.Services.AddScoped<AgencyDbContext>(services => services.GetRequiredService<PostgresAgencyDbContext>());
}
else
{
    builder.Services.AddDbContext<AgencyDbContext>(options => options.UseSqlite(
        builder.Configuration.GetConnectionString("Agency") ?? $"Data Source={Path.Combine(builder.Environment.ContentRootPath, "agency.db")}"));
}
builder.Services.AddScoped<IAgencyDataManager, EfAgencyDataManager>();
builder.Services.AddScoped<AgencyService>();
builder.Services.AddScoped<AccountService>();
builder.Services.AddHttpClient<SecurityClient>(http => http.Timeout = TimeSpan.FromSeconds(10))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddControllersWithViews(options => options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()));
builder.Services.Configure<ApiBehaviorOptions>(options => options.InvalidModelStateResponseFactory =
    context => new BadRequestObjectResult(new { error = "Перевірте обов'язкові поля та формат значень." }));
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-Token";
    options.Cookie.Name = "agency-csrf";
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "agency-session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.SlidingExpiration = false;
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = 401;
        return context.Response.WriteAsJsonAsync(new { error = "Увійдіть до свого облікового запису." });
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = 403;
        return context.Response.WriteAsJsonAsync(new { error = "Недостатньо прав." });
    };
});
builder.Services.AddAuthorization();
var protection = builder.Services.AddDataProtection().SetApplicationName("RealEstateAgency");
if (postgres) protection.PersistKeysToDbContext<AgencyDbContext>();
else protection.PersistKeysToFileSystem(new DirectoryInfo(
    builder.Configuration["DataProtection:Path"] ?? Path.Combine(builder.Environment.ContentRootPath, ".local", "keys")));

var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AgencyDbContext>();
    db.Database.Migrate();
    var data = scope.ServiceProvider.GetRequiredService<IAgencyDataManager>();
    var importIndex = Array.IndexOf(args, "--import-json");
    var exportIndex = Array.IndexOf(args, "--export-json");
    if (importIndex >= 0)
    {
        if (importIndex + 1 >= args.Length) throw new ArgumentException("Specify the JSON file to import.");
        var existing = data.LoadData();
        if (existing.Properties.Any() || existing.Clients.Any() || existing.Agents.Any() || existing.Deals.Any() || existing.Requests.Any())
            throw new InvalidOperationException("Import refused: database is not empty.");
        var imported = JsonSerializer.Deserialize<AgencyDataContext>(File.ReadAllText(args[importIndex + 1]), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidDataException("Invalid agency JSON.");
        // В старом JSON ответственный агент был указан только в сделке.
        foreach (var property in imported.Properties.Where(property => !property.AgentId.HasValue))
        {
            var agents = imported.Deals.Where(deal => deal.PropertyId == property.Id).Select(deal => deal.AgentId).Distinct().ToList();
            if (agents.Count == 1) property.AgentId = agents[0];
        }
        foreach (var client in imported.Clients.Where(client => !client.AgentId.HasValue))
        {
            var agents = imported.Deals.Where(deal => deal.ClientId == client.Id).Select(deal => deal.AgentId).Distinct().ToList();
            if (agents.Count == 1) client.AgentId = agents[0];
        }
        using var transaction = db.Database.BeginTransaction();
        data.SaveData(imported);
        using var document = JsonDocument.Parse(File.ReadAllText(args[importIndex + 1]));
        if (document.RootElement.TryGetProperty("userProfiles", out var profiles))
        {
            var users = profiles.Deserialize<List<UserProfile>>(new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
            db.UserProfiles.AddRange(users);
            db.SaveChanges();
        }
        transaction.Commit();
        Console.WriteLine($"Imported {imported.Properties.Count} properties, {imported.Clients.Count} clients and {imported.Deals.Count} deals into relational tables.");
        return;
    }
    if (exportIndex >= 0)
    {
        if (exportIndex + 1 >= args.Length) throw new ArgumentException("Specify the export file.");
        File.WriteAllText(args[exportIndex + 1], JsonSerializer.Serialize(data.LoadData(), new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true }));
        return;
    }
}

app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    try { await next(); }
    catch (Exception error)
    {
        var status = error switch
        {
            ApiException problem => problem.StatusCode,
            DbUpdateException => 409,
            ArgumentException => 400,
            _ => 500
        };
        var message = error is ApiException or ArgumentException ? error.Message
            : status == 409 ? "Дані змінилися або запис має пов'язані дані. Оновіть сторінку та повторіть дію."
            : "Внутрішня помилка сервера.";
        if (status == 500) app.Logger.LogError("Agency request failed: {ErrorType}", error.GetType().Name);
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { error = message });
    }
});
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/health", (AgencyDbContext db) =>
    db.Database.CanConnect() ? Results.Ok(new { status = "ok", storage = postgres ? "ef-core-postgresql" : "ef-core-sqlite" }) : Results.StatusCode(503));
app.MapFallback("/api/{**path}", () => Results.NotFound(new { error = "API-маршрут не знайдено." }));
app.MapFallbackToFile("index.html");
app.Run();
