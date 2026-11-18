using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RealEstateAgency.BusinessLogicLayer;
using RealEstateAgency.DTOs;
using RealEstateAgency.PersistenceLayer.Entities;

namespace RealEstateAgency.ViewLayer.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class AgencyController : ControllerBase
{
    private readonly AgencyService agency;
    private readonly AccountService accounts;
    private UserProfile CurrentUser => accounts.GetCurrent(User);

    public AgencyController(AgencyService agency, AccountService accounts)
    {
        this.agency = agency;
        this.accounts = accounts;
    }

    [HttpGet("properties")]
    public IActionResult Properties()
    {
        var user = CurrentUser;
        return Ok(agency.GetAllProperties().Where(property => AgencyAccess.CanSeeProperty(user, property)).ToList());
    }

    [HttpPost("properties/search")]
    public IActionResult Search(PropertySearchFilter filter)
    {
        var user = CurrentUser;
        var results = agency.SearchProperties(filter).Where(property => AgencyAccess.CanSeeProperty(user, property)).ToList();
        if (user.Role == "client" && user.ClientId.HasValue) agency.RecordClientSearch(user.ClientId.Value, filter, results.Count);
        return Ok(results);
    }

    [HttpPost("properties")]
    public IActionResult CreateProperty(CreatePropertyDto dto)
    {
        var agentId = AgencyAccess.ResponsibleAgent(CurrentUser, dto.AgentId);
        var property = agency.CreateProperty(dto.Type, dto.Area, dto.Address, dto.District, dto.Landmark, dto.Rooms,
            dto.Price, dto.Status, dto.YearBuilt, out _, agentId);
        // Уведомления с контактами клиентов не возвращаются создавшему объект агенту.
        return Ok(new { property, notifications = Array.Empty<string>() });
    }

    [HttpPut("properties/{id:guid}")]
    public IActionResult UpdateProperty(Guid id, CreatePropertyDto dto)
    {
        var user = CurrentUser;
        AgencyAccess.CheckProperty(user, agency.GetPropertyById(id.ToString()));
        var agentId = AgencyAccess.ResponsibleAgent(user, dto.AgentId);
        agency.UpdateProperty(id.ToString(), dto.Type, dto.Area, dto.Address, dto.District, dto.Landmark, dto.Rooms,
            dto.Price, dto.Status, dto.YearBuilt, agentId);
        return Ok(new { });
    }

    [HttpPatch("properties/{id:guid}/status")]
    public IActionResult ChangeStatus(Guid id, ChangeStatusDto dto)
    {
        AgencyAccess.CheckProperty(CurrentUser, agency.GetPropertyById(id.ToString()));
        agency.ChangePropertyStatus(id.ToString(), dto.NewStatus, dto.Comment);
        return Ok(new { });
    }

    [HttpDelete("properties/{id:guid}")]
    public IActionResult DeleteProperty(Guid id)
    {
        AgencyAccess.CheckProperty(CurrentUser, agency.GetPropertyById(id.ToString()));
        agency.DeleteProperty(id.ToString());
        return Ok(new { });
    }

    [HttpGet("properties/{id:guid}/history")]
    public IActionResult PropertyHistory(Guid id)
    {
        AgencyAccess.CheckProperty(CurrentUser, agency.GetPropertyById(id.ToString()));
        return Ok(agency.GetPropertyStatusHistory(id.ToString()));
    }

    [HttpGet("clients")]
    public IActionResult Clients()
    {
        var user = CurrentUser;
        return Ok(agency.GetAllClients().Where(client => AgencyAccess.CanSeeClient(user, client)).ToList());
    }

    [HttpPost("clients")]
    public IActionResult CreateClient(CreateClientDto dto) => Ok(agency.CreateClient(dto.Name, dto.ContactInfo, dto.Type, AgencyAccess.ResponsibleAgent(CurrentUser, dto.AgentId)));

    [HttpPut("clients/{id:guid}")]
    public IActionResult UpdateClient(Guid id, CreateClientDto dto)
    {
        var user = CurrentUser;
        AgencyAccess.RequireStaff(user);
        AgencyAccess.CheckClient(user, agency.GetClientById(id.ToString()));
        agency.UpdateClient(id.ToString(), dto.Name, dto.ContactInfo, dto.Type, AgencyAccess.ResponsibleAgent(user, dto.AgentId));
        return Ok(new { });
    }

    [HttpDelete("clients/{id:guid}")]
    public IActionResult DeleteClient(Guid id)
    {
        var user = CurrentUser;
        AgencyAccess.RequireStaff(user);
        AgencyAccess.CheckClient(user, agency.GetClientById(id.ToString()));
        agency.DeleteClient(id.ToString());
        return Ok(new { });
    }

    [HttpPost("clients/{id:guid}/searches")]
    public IActionResult SaveSearch(Guid id, SaveSearchDto dto)
    {
        AgencyAccess.CheckClient(CurrentUser, agency.GetClientById(id.ToString()));
        agency.SaveClientSearch(id.ToString(), dto.Title, dto.Filter);
        return Ok(new { });
    }

    [HttpGet("clients/{id:guid}/searches")]
    public IActionResult SavedSearches(Guid id)
    {
        AgencyAccess.CheckClient(CurrentUser, agency.GetClientById(id.ToString()));
        return Ok(agency.GetClientSavedSearches(id.ToString()));
    }

    [HttpGet("clients/{id:guid}/notifications")]
    public IActionResult Notifications(Guid id)
    {
        AgencyAccess.CheckClient(CurrentUser, agency.GetClientById(id.ToString()));
        return Ok(agency.GetClientNotifications(id.ToString()));
    }

    [HttpPost("clients/{id:guid}/requests")]
    public IActionResult CreateRequest(Guid id, CreateRequestDto dto)
    {
        AgencyAccess.CheckClient(CurrentUser, agency.GetClientById(id.ToString()));
        return Ok(agency.CreateClientRequest(id, dto.Title, dto.Filter));
    }

    [HttpGet("clients/{id:guid}/requests")]
    public IActionResult ClientRequests(Guid id)
    {
        AgencyAccess.CheckClient(CurrentUser, agency.GetClientById(id.ToString()));
        return Ok(agency.GetClientRequests(id));
    }

    [HttpGet("clients/{id:guid}/history")]
    public IActionResult SearchHistory(Guid id)
    {
        AgencyAccess.CheckClient(CurrentUser, agency.GetClientById(id.ToString()));
        return Ok(agency.GetClientSearchHistory(id));
    }

    [HttpGet("clients/{id:guid}/matches")]
    public IActionResult SavedMatches(Guid id)
    {
        var user = CurrentUser;
        AgencyAccess.CheckClient(user, agency.GetClientById(id.ToString()));
        return Ok(agency.MatchPropertiesForClientSavedSearches(id).Where(property => AgencyAccess.CanSeeProperty(user, property)).ToList());
    }

    [HttpGet("requests/{id:guid}/matches")]
    public IActionResult RequestMatches(Guid id)
    {
        var user = CurrentUser;
        var request = agency.GetRequestById(id);
        AgencyAccess.CheckClient(user, agency.GetClientById(request.ClientId.ToString()));
        return Ok(agency.MatchPropertiesForRequest(id).Where(property => AgencyAccess.CanSeeProperty(user, property)).ToList());
    }

    [HttpGet("agents")]
    public IActionResult Agents()
    {
        var user = CurrentUser;
        AgencyAccess.RequireStaff(user);
        return Ok(agency.GetAllAgents().Where(agent => user.Role == "manager" || agent.Id == user.AgentId).ToList());
    }

    [HttpPost("agents")]
    public IActionResult CreateAgent(CreateAgentDto dto)
    {
        AgencyAccess.RequireManager(CurrentUser);
        return Ok(agency.CreateAgent(dto.Name, dto.ExperienceYears));
    }

    [HttpDelete("agents/{id:guid}")]
    public IActionResult DeleteAgent(Guid id)
    {
        AgencyAccess.RequireManager(CurrentUser);
        agency.DeleteAgent(id.ToString());
        return Ok(new { });
    }

    [HttpGet("deals")]
    public IActionResult Deals()
    {
        var user = CurrentUser;
        AgencyAccess.RequireStaff(user);
        return Ok(agency.GetAllDeals().Where(deal => user.Role == "manager" || deal.AgentId == user.AgentId).ToList());
    }

    [HttpPost("deals")]
    public IActionResult CreateDeal(CreateDealDto dto)
    {
        var user = CurrentUser;
        AgencyAccess.RequireStaff(user);
        var property = agency.GetPropertyById(dto.PropertyId);
        var client = agency.GetClientById(dto.ClientId);
        var agent = agency.GetAgentById(dto.AgentId);
        AgencyAccess.CheckProperty(user, property);
        AgencyAccess.CheckClient(user, client);
        if (user.Role == "agent" && agent.Id != user.AgentId) throw new ApiException(403, "Агент може створювати тільки власні угоди.");
        if (property.AgentId != agent.Id || client.AgentId != agent.Id) throw new ApiException(400, "Об'єкт і клієнт повинні належати агенту цієї угоди.");
        return Ok(agency.CreateDeal(property.Id.ToString(), client.Id.ToString(), agent.Id.ToString(), dto.Price, dto.DealType, dto.Commission));
    }

    [HttpDelete("deals/{id:guid}")]
    public IActionResult CancelDeal(Guid id, string? reason)
    {
        var user = CurrentUser;
        var deal = agency.GetDealById(id.ToString());
        AgencyAccess.CheckDeal(user, deal);
        AgencyAccess.CheckProperty(user, agency.GetPropertyById(deal.PropertyId.ToString()));
        agency.CancelDeal(id.ToString(), reason ?? "Розірвання договору");
        return Ok(new { });
    }

    [HttpGet("users")]
    public IActionResult Users() => Ok(accounts.GetAll(CurrentUser));

    [HttpPatch("users/{id:guid}")]
    public IActionResult AssignRole(Guid id, AssignRoleDto dto) => Ok(accounts.AssignRole(CurrentUser, id, dto.Role, dto.AgentId, dto.ClientId));

    [HttpGet("analytics")]
    public IActionResult Analytics(DateTime? startDate, DateTime? endDate)
    {
        AgencyAccess.RequireManager(CurrentUser);
        CheckDates(startDate, endDate);
        var properties = agency.GetAllProperties();
        var clients = agency.GetAllClients();
        return Ok(new
        {
            dealsCount = agency.GetDealsByPeriod(startDate, endDate).Count,
            totalSales = agency.GetTotalSalesAmount(startDate, endDate), totalProfit = agency.GetTotalAgencyProfit(startDate, endDate),
            avgSqmCatalog = agency.GetAveragePricePerSquareMeterAllProperties(), avgSqmDeals = agency.GetAveragePricePerSquareMeterSoldDeals(),
            agentsPerformance = agency.GetAgentsPerformance(), mostActiveClients = agency.GetMostActiveClients(), priceDynamics = agency.GetPriceDynamics(),
            totalProperties = properties.Count, forSaleCount = properties.Count(p => p.Status == PropertyStatus.ForSale),
            forRentCount = properties.Count(p => p.Status == PropertyStatus.ForRent), soldCount = properties.Count(p => p.Status == PropertyStatus.Sold),
            totalClients = clients.Count, buyersCount = clients.Count(c => c.Type == ClientType.Buyer),
            tenantsCount = clients.Count(c => c.Type == ClientType.Tenant), ownersCount = clients.Count(c => c.Type == ClientType.Owner),
            totalRequests = agency.GetTotalRequestsCount()
        });
    }

    [HttpGet("reports")]
    public IActionResult Report(DateTime? startDate, DateTime? endDate)
    {
        AgencyAccess.RequireManager(CurrentUser);
        CheckDates(startDate, endDate);
        var csv = new StringBuilder("Дата,Об'єкт,Клієнт,Агент,Сума,Комісія %,Дохід\r\n");
        foreach (var deal in agency.GetDealsByPeriod(startDate, endDate))
        {
            var cells = new[] { deal.Date.ToString("yyyy-MM-dd"), agency.GetPropertyById(deal.PropertyId.ToString()).Address,
                agency.GetClientById(deal.ClientId.ToString()).Name, agency.GetAgentById(deal.AgentId.ToString()).Name,
                deal.TotalCost.ToString(CultureInfo.InvariantCulture), deal.CommissionPercent.ToString(CultureInfo.InvariantCulture),
                deal.CalculateCommissionAmount().ToString(CultureInfo.InvariantCulture) };
            csv.AppendLine(string.Join(",", cells.Select(CsvCell)));
        }
        return File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(), "text/csv; charset=utf-8", "agency-deals.csv");
    }

    private static string CsvCell(string value)
    {
        if (value.TrimStart().StartsWith('=') || value.TrimStart().StartsWith('+') || value.TrimStart().StartsWith('-') || value.TrimStart().StartsWith('@')) value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }

    private static void CheckDates(DateTime? start, DateTime? end)
    {
        if (start.HasValue && end.HasValue && start.Value.Date > end.Value.Date) throw new ApiException(400, "Початок періоду пізніше за його кінець.");
    }
}
