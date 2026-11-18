using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Security.Auth;

public sealed class PostgresApplicationDbContext(DbContextOptions<PostgresApplicationDbContext> options)
    : IdentityDbContext<IdentityUser>(options)
{
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.HasDefaultSchema("security_accounts");
    }
}

// Generating migrations never needs production credentials or a running database.
public sealed class PostgresContextFactory : IDesignTimeDbContextFactory<PostgresApplicationDbContext>
{
    public PostgresApplicationDbContext CreateDbContext(string[] args)
        => new(new DbContextOptionsBuilder<PostgresApplicationDbContext>()
            .UseNpgsql("Host=localhost;Database=security_design;Username=design;Password=design-only",
                postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "security_accounts"))
            .Options);
}
