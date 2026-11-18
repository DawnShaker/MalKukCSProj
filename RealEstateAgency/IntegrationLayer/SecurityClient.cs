using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using RealEstateAgency.BusinessLogicLayer;

namespace RealEstateAgency.IntegrationLayer;

public record SecurityUser(Guid Id, string Username, bool IsAdmin, DateTime ExpiresAt);

// Только этот класс знает адрес и HTTP-контракт сервера преподавателя.
public class SecurityClient
{
    private readonly HttpClient http;
    private readonly IConfiguration configuration;
    private readonly IWebHostEnvironment environment;

    public SecurityClient(HttpClient http, IConfiguration configuration, IWebHostEnvironment environment)
    {
        this.http = http;
        this.configuration = configuration;
        this.environment = environment;
    }

    public async Task<SecurityUser> Login(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Length > 256 || string.IsNullOrEmpty(password) || password.Length > 128)
            throw new ApiException(400, "Вкажіть логін і пароль.");

        var url = configuration["Security:Url"];
        var key = configuration["Security:JwtKey"] ?? "";
        var issuer = configuration["Security:Issuer"];
        var audience = configuration["Security:Audience"];
        if (!Uri.TryCreate(url, UriKind.Absolute, out var address) ||
            (!address.Scheme.Equals("https") && !(environment.IsDevelopment() && address.IsLoopback && address.Scheme == "http")) ||
            address.UserInfo != "" || address.AbsolutePath != "/" || address.Query != "" || address.Fragment != "" ||
            Encoding.UTF8.GetByteCount(key) < 32 || string.IsNullOrWhiteSpace(issuer) || string.IsNullOrWhiteSpace(audience))
            throw new ApiException(503, "Налаштуйте адресу та параметри JWT сервера Security.");

        HttpResponseMessage response;
        try
        {
            response = await http.PostAsJsonAsync(new Uri(address, "/api/Users/login"), new { username = username.Trim(), password });
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            throw new ApiException(503, "Сервер Security тимчасово недоступний.");
        }

        using (response)
        {
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                throw new ApiException(429, "Забагато спроб входу. Спробуйте пізніше.");
            if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden or HttpStatusCode.NotFound)
                throw new ApiException(401, "Перевірте логін і пароль.");
            if (!response.IsSuccessStatusCode)
                throw new ApiException(503, "Сервер Security тимчасово недоступний.");

            try
            {
                var result = await response.Content.ReadFromJsonAsync<LoginResponse>();
                var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
                var principal = handler.ValidateToken(result?.Token, new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
                    ValidateIssuer = true, ValidIssuer = issuer,
                    ValidateAudience = true, ValidAudience = audience,
                    ValidateLifetime = true, RequireExpirationTime = true,
                    ClockSkew = TimeSpan.Zero,
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256]
                }, out var validated);

                var name = principal.FindFirst(ClaimTypes.Name)?.Value;
                if (!Guid.TryParse(principal.FindFirst("Id")?.Value, out var id) || id == Guid.Empty ||
                    !string.Equals(name, username.Trim(), StringComparison.OrdinalIgnoreCase))
                    throw new SecurityTokenException();
                // Поле role из JSON-ответа не используется: доверяем только подписанным claims.
                return new SecurityUser(id, name!, principal.HasClaim(ClaimTypes.Role, "Admin"), validated.ValidTo);
            }
            catch (Exception error) when (error is SecurityTokenException or ArgumentException or System.Text.Json.JsonException)
            {
                throw new ApiException(401, "Security повернув недійсний токен.");
            }
        }
    }

    private class LoginResponse
    {
        public string Token { get; set; } = "";
    }
}
