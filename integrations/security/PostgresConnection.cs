using Npgsql;

namespace Security.Auth;

public static class PostgresConnection
{
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        try
        {
            NpgsqlConnectionStringBuilder settings;
            if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "postgres" or "postgresql")
            {
                var credentials = uri.UserInfo.Split(':', 2);
                if (credentials.Length != 2 || string.IsNullOrEmpty(uri.Host)) throw new FormatException();
                settings = new NpgsqlConnectionStringBuilder
                {
                    Host = uri.Host,
                    Port = uri.IsDefaultPort ? 5432 : uri.Port,
                    Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
                    Username = Uri.UnescapeDataString(credentials[0]),
                    Password = Uri.UnescapeDataString(credentials[1]),
                    SslMode = SslMode.VerifyFull,
                };
                foreach (var parameter in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
                {
                    var pair = parameter.Split('=', 2);
                    if (pair.Length != 2 || pair[0] != "sslmode" ||
                        !Enum.TryParse<SslMode>(Uri.UnescapeDataString(pair[1]).Replace("-", ""), true, out var mode))
                        throw new FormatException();
                    settings.SslMode = mode;
                }
            }
            else settings = new NpgsqlConnectionStringBuilder(value);
            if (string.IsNullOrEmpty(settings.Host) || string.IsNullOrEmpty(settings.Database) || string.IsNullOrEmpty(settings.Username))
                throw new FormatException();
            settings.MaxPoolSize = 5;
            settings.Timeout = 15;
            settings.CommandTimeout = 60;
            settings.IncludeErrorDetail = false;
            return settings.ConnectionString;
        }
        catch
        {
            // Invalid connection strings can contain passwords. Never include the input or inner exception.
            throw new InvalidOperationException("ConnectionStrings__Security must be a PostgreSQL URI or Npgsql connection string.");
        }
    }
}
