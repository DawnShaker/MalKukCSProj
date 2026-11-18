using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace RealEstateAgency.PersistenceLayer;

public sealed class AgencyDbContextFactory : IDesignTimeDbContextFactory<AgencyDbContext>
{
    public AgencyDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Agency") ?? "Data Source=agency.db";
        return new AgencyDbContext(new DbContextOptionsBuilder<AgencyDbContext>().UseSqlite(connection).Options);
    }
}
