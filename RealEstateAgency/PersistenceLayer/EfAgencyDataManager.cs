using Microsoft.EntityFrameworkCore;
using RealEstateAgency.PersistenceLayer.Entities;

namespace RealEstateAgency.PersistenceLayer;

public sealed class EfAgencyDataManager(AgencyDbContext db) : IAgencyDataManager
{
    private AgencyRevision? revision;

    public AgencyDataContext LoadData()
    {
        using var transaction = db.Database.BeginTransaction();
        revision = db.Revisions.Single();
        var state = new AgencyDataContext
        {
            Agents = db.Agents.ToList(),
            Properties = db.Properties.Include(row => row.StatusHistory).Include(row => row.PriceHistory).AsSplitQuery().ToList(),
            Clients = db.Clients.Include(row => row.SavedSearches).Include(row => row.Requests).AsSplitQuery().ToList(),
            Deals = db.Deals.ToList(),
            Requests = db.Requests.ToList(),
            SearchHistory = db.SearchHistory.ToList()
        };
        var notifications = db.Notifications.OrderBy(row => row.Position).ToList();
        foreach (var client in state.Clients)
        {
            client.Notifications = notifications.Where(row => row.ClientId == client.Id).Select(row => row.Message).ToList();
            client.SavedSearches = client.SavedSearches.OrderByDescending(row => row.CreatedAt).ToList();
        }
        foreach (var property in state.Properties)
        {
            property.StatusHistory = property.StatusHistory.OrderBy(row => row.Position).ToList();
            property.PriceHistory = property.PriceHistory.OrderBy(row => row.Position).ToList();
        }
        transaction.Commit();
        return state;
    }

    public void SaveData(AgencyDataContext state)
    {
        revision ??= db.Revisions.Single();
        foreach (var property in state.Properties)
        {
            for (var index = 0; index < property.StatusHistory.Count; index++)
            {
                property.StatusHistory[index].PropertyId = property.Id;
                property.StatusHistory[index].Position = index;
            }
            for (var index = 0; index < property.PriceHistory.Count; index++)
            {
                property.PriceHistory[index].PropertyId = property.Id;
                property.PriceHistory[index].Position = index;
            }
        }
        foreach (var client in state.Clients)
        {
            client.Requests = state.Requests.Where(row => row.ClientId == client.Id).ToList();
            foreach (var search in client.SavedSearches) search.ClientId = client.Id;
            var old = db.Notifications.Local.Where(row => row.ClientId == client.Id).OrderBy(row => row.Position).ToList();
            if (!old.Select(row => row.Message).SequenceEqual(client.Notifications))
            {
                db.Notifications.RemoveRange(old);
                db.Notifications.AddRange(client.Notifications.Select((message, index) => new ClientNotification { ClientId = client.Id, Message = message, Position = index }));
            }
        }
        Synchronize(db.Agents, state.Agents);
        Synchronize(db.Clients, state.Clients);
        Synchronize(db.Properties, state.Properties);
        Synchronize(db.Deals, state.Deals);
        Synchronize(db.Requests, state.Requests);
        Synchronize(db.SearchHistory, state.SearchHistory);
        revision.Version++;
        // EF runs all entity changes and the concurrency-checked revision in one transaction.
        db.SaveChanges();
    }

    private void Synchronize<T>(DbSet<T> set, List<T> desired) where T : class
    {
        var id = typeof(T).GetProperty("Id")!;
        var ids = desired.Select(row => id.GetValue(row)).ToHashSet();
        foreach (var old in set.Local.ToList())
            if (!ids.Contains(id.GetValue(old))) set.Remove(old);
        foreach (var row in desired)
            if (db.Entry(row).State == EntityState.Detached) set.Add(row);
    }
}
