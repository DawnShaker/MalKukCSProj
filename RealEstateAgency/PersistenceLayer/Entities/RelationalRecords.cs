namespace RealEstateAgency.PersistenceLayer.Entities;

public class ClientNotification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClientId { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int Position { get; set; }
}

public class ClientSearchHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClientId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public PropertySearchFilter Filter { get; set; } = new();
    public int ResultCount { get; set; }
}

public class UserProfile
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "client";
    public Guid? AgentId { get; set; }
    public Guid? ClientId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class AgencyRevision
{
    public int Id { get; set; } = 1;
    public long Version { get; set; }
}
