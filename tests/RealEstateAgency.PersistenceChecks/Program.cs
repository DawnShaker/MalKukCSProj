using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using RealEstateAgency.BusinessLogicLayer;
using RealEstateAgency.PersistenceLayer;
using RealEstateAgency.PersistenceLayer.Entities;
using System.Text.Json;

var path = Path.Combine(Path.GetTempPath(), $"realestate-ef-check-{Guid.NewGuid()}.db");
var options = new DbContextOptionsBuilder<AgencyDbContext>().UseSqlite($"Data Source={path}").Options;
void Check(bool condition, string name)
{
    if (!condition) throw new Exception($"Failed: {name}");
    Console.WriteLine($"PASS: {name}");
}
try
{
    var source = JsonSerializer.Deserialize<AgencyDataContext>(File.ReadAllText("RealEstateAgency/agency_data.json"), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    using (var db = new AgencyDbContext(options))
    {
        db.Database.Migrate();
        var storage = new EfAgencyDataManager(db);
        Check(storage.LoadData().Properties.Count == 0, "migration creates empty relational database");
        storage.SaveData(source);
    }
    using (var db = new AgencyDbContext(options))
    {
        var storage = new EfAgencyDataManager(db);
        var data = storage.LoadData();
        Check(data.Properties.Count == 12 && data.Clients.Count == 3 && data.Deals.Count == 2, "legacy root records survive a new DbContext");
        Check(db.StatusHistory.Count() == source.Properties.Sum(row => row.StatusHistory.Count), "status histories are rows");
        Check(db.PriceHistory.Count() == source.Properties.Sum(row => row.PriceHistory.Count), "price histories are rows");
        Check(db.Notifications.Count() == source.Clients.Sum(row => row.Notifications.Count), "notifications are rows");
        Check(data.Properties.Select(row=>row.Id).ToHashSet().SetEquals(source.Properties.Select(row=>row.Id)), "legacy IDs are preserved");
        var service = new AgencyService(storage);
        Check(service.GetTotalAgencyProfit() == 26000m, "financial results agree with original JSON");
        var property = service.GetAllProperties().First();
        var oldHistory = property.PriceHistory.Count;
        service.UpdateProperty(property.Id.ToString(), property.Type, property.Area, property.Address, property.District, property.Landmark, property.Rooms, property.Price + 100, property.Status, property.YearBuilt);
        Check(db.PriceHistory.Count(row=>row.PropertyId==property.Id) == oldHistory + 1, "business edits persist price histories through EF");
        var added = service.CreateProperty("Квартира", 40, "Test address", "Test district", "Test landmark", 1, 50000m, PropertyStatus.ForSale, 2020, out _);
        var deal = service.CreateDeal(added.Id.ToString(), service.GetAllClients()[0].Id.ToString(), service.GetAllAgents()[0].Id.ToString(), 50000m, DealType.Purchase, 5m);
        Check(added.Status == PropertyStatus.Sold && db.Deals.Any(row=>row.Id==deal.Id), "deal and property status save together");
        service.CancelDeal(deal.Id.ToString());
        Check(added.Status == PropertyStatus.ForSale && !db.Deals.Any(row=>row.Id==deal.Id), "cancellation restores status and removes deal");
    }
    using (var first = new AgencyDbContext(options))
    using (var second = new AgencyDbContext(options))
    {
        var a = new EfAgencyDataManager(first);
        var b = new EfAgencyDataManager(second);
        var stateA = a.LoadData(); var stateB = b.LoadData();
        stateA.Agents.Add(new Agent("First writer",1)); a.SaveData(stateA);
        stateB.Agents.Add(new Agent("Second writer",2));
        var rejected = false;
        try { b.SaveData(stateB); } catch (DbUpdateConcurrencyException) { rejected = true; }
        Check(rejected,"concurrent stale snapshots are rejected");
    }
    using (var db = new AgencyDbContext(options))
    {
        var storage = new EfAgencyDataManager(db);
        var data = storage.LoadData();
        Check(data.Agents.Any(a=>a.Name=="First writer") && data.Agents.All(a=>a.Name!="Second writer"), "failed concurrency transaction leaves no partial writes");
        var exported = JsonSerializer.Deserialize<AgencyDataContext>(JsonSerializer.Serialize(data), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Check(exported.Deals.Count == data.Deals.Count && exported.Properties.Count == data.Properties.Count, "optional JSON export round-trips");
    }
}
finally
{
    SqliteConnection.ClearAllPools();
    if (!Path.GetFullPath(path).StartsWith(Path.Combine(Path.GetTempPath(), "realestate-ef-check-"))) throw new Exception("Unexpected test database path");
    foreach (var file in new[] { path, path + "-wal", path + "-shm" }) if (File.Exists(file)) File.Delete(file);
}
