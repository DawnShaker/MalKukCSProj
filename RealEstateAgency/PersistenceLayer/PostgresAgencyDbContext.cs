using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace RealEstateAgency.PersistenceLayer;

// Те же сущности и правила, другой провайдер БД для бесплатного хостинга.
public class PostgresAgencyDbContext(DbContextOptions<PostgresAgencyDbContext> options) : AgencyDbContext(options)
{
    protected override void OnModelCreating(ModelBuilder model)
    {
        base.OnModelCreating(model);
        model.HasDefaultSchema("agency_ef");
        var utc = new ValueConverter<DateTime, DateTime>(
            value => DateTime.SpecifyKind(value, DateTimeKind.Utc),
            value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        foreach (var entity in model.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
                if (property.ClrType == typeof(DateTime)) property.SetValueConverter(utc);
    }
}

public class PostgresAgencyDbContextFactory : IDesignTimeDbContextFactory<PostgresAgencyDbContext>
{
    public PostgresAgencyDbContext CreateDbContext(string[] args)
    {
        // Генерация миграций не требует пароля и подключения к рабочей БД.
        return new PostgresAgencyDbContext(new DbContextOptionsBuilder<PostgresAgencyDbContext>()
            .UseNpgsql("Host=localhost;Database=agency_design;Username=design",
                options => options.MigrationsHistoryTable("__EFMigrationsHistory", "agency_ef")).Options);
    }
}
