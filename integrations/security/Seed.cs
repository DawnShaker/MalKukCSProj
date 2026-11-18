using Microsoft.AspNetCore.Identity;

namespace Security.Auth;

// Replaces the upstream demo seed; credentials come only from local/server configuration.
public static class Seed
{
    public const string AdminRole = "Admin";

    public static void Initialize(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var username = configuration["BootstrapAdmin:Username"];
        var password = configuration["BootstrapAdmin:Password"];
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password) || password.Length < 12)
            throw new InvalidOperationException("Set BootstrapAdmin__Username and BootstrapAdmin__Password (at least 12 characters).");

        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
        if (!roles.RoleExistsAsync(AdminRole).GetAwaiter().GetResult())
            RequireSuccess(roles.CreateAsync(new IdentityRole(AdminRole)).GetAwaiter().GetResult());
        var user = users.FindByNameAsync(username).GetAwaiter().GetResult();
        if (user is not null)
        {
            if (!users.IsInRoleAsync(user, AdminRole).GetAwaiter().GetResult())
                throw new InvalidOperationException("Configured bootstrap username belongs to a non-admin account. Existing accounts are never promoted automatically.");
            return;
        }
        user = new IdentityUser { UserName = username, SecurityStamp = Guid.NewGuid().ToString() };
        RequireSuccess(users.CreateAsync(user, password).GetAwaiter().GetResult());
        RequireSuccess(users.AddToRoleAsync(user, AdminRole).GetAwaiter().GetResult());
    }

    private static void RequireSuccess(IdentityResult result)
    {
        if (!result.Succeeded)
            throw new InvalidOperationException("Account bootstrap failed: " + string.Join(", ", result.Errors.Select(error => error.Code)));
    }
}
