using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using RealEstateAgency.PersistenceLayer.Entities;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;

namespace RealEstateAgency.PersistenceLayer;

public class AgencyDbContext(DbContextOptions options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();
    public DbSet<Property> Properties => Set<Property>();
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<Agent> Agents => Set<Agent>();
    public DbSet<Deal> Deals => Set<Deal>();
    public DbSet<ClientRequest> Requests => Set<ClientRequest>();
    public DbSet<SavedClientSearch> SavedSearches => Set<SavedClientSearch>();
    public DbSet<StatusHistoryEntry> StatusHistory => Set<StatusHistoryEntry>();
    public DbSet<PriceHistoryEntry> PriceHistory => Set<PriceHistoryEntry>();
    public DbSet<ClientNotification> Notifications => Set<ClientNotification>();
    public DbSet<ClientSearchHistory> SearchHistory => Set<ClientSearchHistory>();
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<AgencyRevision> Revisions => Set<AgencyRevision>();

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static string SerializeFilter(PropertySearchFilter filter) => JsonSerializer.Serialize(filter, JsonOptions);
    private static PropertySearchFilter DeserializeFilter(string value) => JsonSerializer.Deserialize<PropertySearchFilter>(value, JsonOptions) ?? new();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Property>().ToTable("properties");
        model.Entity<Client>().ToTable("clients").Ignore(client => client.Notifications);
        model.Entity<Agent>().ToTable("agents");
        model.Entity<Deal>().ToTable("deals");
        model.Entity<ClientRequest>().ToTable("client_requests");
        model.Entity<SavedClientSearch>().ToTable("saved_searches");
        model.Entity<StatusHistoryEntry>().ToTable("property_status_history");
        model.Entity<PriceHistoryEntry>().ToTable("property_price_history");
        model.Entity<ClientNotification>().ToTable("client_notifications");
        model.Entity<ClientSearchHistory>().ToTable("search_history");
        model.Entity<UserProfile>().ToTable("user_profiles");
        model.Entity<AgencyRevision>().ToTable("agency_revision");
        model.Entity<AgencyRevision>().Property(row => row.Id).ValueGeneratedNever();
        model.Entity<AgencyRevision>().Property(row => row.Version).IsConcurrencyToken();
        model.Entity<AgencyRevision>().HasData(new AgencyRevision());
        model.Entity<Property>().HasMany(row => row.StatusHistory).WithOne().HasForeignKey(row => row.PropertyId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<Property>().HasMany(row => row.PriceHistory).WithOne().HasForeignKey(row => row.PropertyId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<Client>().HasMany(row => row.SavedSearches).WithOne().HasForeignKey(row => row.ClientId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<Client>().HasMany(row => row.Requests).WithOne().HasForeignKey(row => row.ClientId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<ClientNotification>().HasOne<Client>().WithMany().HasForeignKey(row => row.ClientId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<ClientSearchHistory>().HasOne<Client>().WithMany().HasForeignKey(row => row.ClientId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<Property>().HasOne<Agent>().WithMany().HasForeignKey(row => row.AgentId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Client>().HasOne<Agent>().WithMany().HasForeignKey(row => row.AgentId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Deal>().HasOne<Property>().WithMany().HasForeignKey(row => row.PropertyId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Deal>().HasOne<Client>().WithMany().HasForeignKey(row => row.ClientId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Deal>().HasOne<Agent>().WithMany().HasForeignKey(row => row.AgentId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<UserProfile>().HasOne<Agent>().WithMany().HasForeignKey(row => row.AgentId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<UserProfile>().HasOne<Client>().WithMany().HasForeignKey(row => row.ClientId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<UserProfile>().HasIndex(row => row.Email).IsUnique();

        var converter = new ValueConverter<PropertySearchFilter, string>(filter => SerializeFilter(filter), value => DeserializeFilter(value));
        var comparer = new ValueComparer<PropertySearchFilter>((left, right) => SerializeFilter(left!) == SerializeFilter(right!), filter => SerializeFilter(filter).GetHashCode(), filter => DeserializeFilter(SerializeFilter(filter)));
        model.Entity<SavedClientSearch>().Property(row => row.Filter).HasConversion(converter).Metadata.SetValueComparer(comparer);
        model.Entity<ClientRequest>().Property(row => row.Filter).HasConversion(converter).Metadata.SetValueComparer(comparer);
        model.Entity<ClientSearchHistory>().Property(row => row.Filter).HasConversion(converter).Metadata.SetValueComparer(comparer);

        foreach (var entity in model.Model.GetEntityTypes())
        {
            entity.FindPrimaryKey()?.Properties.ToList().ForEach(property => property.ValueGenerated = Microsoft.EntityFrameworkCore.Metadata.ValueGenerated.Never);
            foreach (var property in entity.GetProperties())
                property.SetColumnName(char.ToLowerInvariant(property.Name[0]) + property.Name[1..]);
        }
        model.Entity<DataProtectionKey>().Property(key => key.Id).ValueGeneratedOnAdd();
    }
}
