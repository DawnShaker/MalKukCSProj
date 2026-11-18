using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using RealEstateAgency.IntegrationLayer;
using RealEstateAgency.PersistenceLayer;
using RealEstateAgency.PersistenceLayer.Entities;

namespace RealEstateAgency.BusinessLogicLayer;

public class AccountService
{
    private readonly AgencyDbContext db;
    private readonly IConfiguration configuration;

    public AccountService(AgencyDbContext db, IConfiguration configuration)
    {
        this.db = db;
        this.configuration = configuration;
    }

    public UserProfile? FindCurrent(ClaimsPrincipal principal)
    {
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return null;
        // Читаем роль заново: изменения менеджера действуют уже при следующем запросе.
        return db.UserProfiles.AsNoTracking().SingleOrDefault(user => user.Id == id);
    }

    public UserProfile GetCurrent(ClaimsPrincipal principal)
    {
        return FindCurrent(principal) ?? throw new ApiException(401, "Увійдіть до свого облікового запису.");
    }

    public UserProfile SignIn(SecurityUser identity)
    {
        using var transaction = db.Database.BeginTransaction();
        var profile = db.UserProfiles.SingleOrDefault(user => user.Id == identity.Id);
        if (profile != null) return profile;

        var login = identity.Username.ToLowerInvariant();
        if (db.UserProfiles.Any(user => user.Email == login))
            throw new ApiException(409, "Цей логін вже пов'язаний з іншим обліковим записом.");
        var bootstrap = configuration["Security:BootstrapManagerUsername"];
        var isManager = identity.IsAdmin && string.Equals(bootstrap, identity.Username, StringComparison.OrdinalIgnoreCase)
            && !db.UserProfiles.Any(user => user.Role == "manager");
        profile = new UserProfile
        {
            Id = identity.Id, Email = login, DisplayName = identity.Username,
            Role = isManager ? "manager" : "client"
        };
        if (!isManager)
        {
            var client = new Client(identity.Username, identity.Username, ClientType.Buyer);
            db.Clients.Add(client);
            profile.ClientId = client.Id;
        }
        db.UserProfiles.Add(profile);
        db.Revisions.Single().Version++;
        db.SaveChanges();
        transaction.Commit();
        return profile;
    }

    public List<UserProfile> GetAll(UserProfile actor)
    {
        AgencyAccess.RequireManager(actor);
        return db.UserProfiles.AsNoTracking().OrderBy(user => user.CreatedAt).ToList();
    }

    public UserProfile AssignRole(UserProfile actor, Guid id, string role, Guid? agentId, Guid? clientId)
    {
        AgencyAccess.RequireManager(actor);
        if (role != "manager" && role != "agent" && role != "client")
            throw new ApiException(400, "Невідома роль.");
        using var transaction = db.Database.BeginTransaction();
        var profile = db.UserProfiles.SingleOrDefault(user => user.Id == id)
            ?? throw new ApiException(404, "Користувача не знайдено.");
        if (profile.Role == "manager" && role != "manager" && db.UserProfiles.Count(user => user.Role == "manager") == 1)
            throw new ApiException(409, "Не можна забрати доступ в останнього менеджера.");
        if (role == "agent" && (!agentId.HasValue || !db.Agents.Any(agent => agent.Id == agentId)))
            throw new ApiException(400, "Оберіть наявного агента.");
        if (role == "client" && (!clientId.HasValue || !db.Clients.Any(client => client.Id == clientId)))
            throw new ApiException(400, "Оберіть наявного клієнта.");
        if (role == "agent" && db.UserProfiles.Any(user => user.Id != id && user.AgentId == agentId))
            throw new ApiException(409, "Цей агент вже має обліковий запис.");
        if (role == "client" && db.UserProfiles.Any(user => user.Id != id && user.ClientId == clientId))
            throw new ApiException(409, "Цей клієнт вже має обліковий запис.");
        profile.Role = role;
        profile.AgentId = role == "agent" ? agentId : null;
        profile.ClientId = role == "client" ? clientId : null;
        db.Revisions.Single().Version++;
        db.SaveChanges();
        transaction.Commit();
        return profile;
    }
}
