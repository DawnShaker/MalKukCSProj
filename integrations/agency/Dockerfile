FROM node:24-bookworm-slim AS client
WORKDIR /client
COPY client-app/package.json client-app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client-app/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY RealEstateAgency/RealEstateAgency.csproj RealEstateAgency/
RUN dotnet restore RealEstateAgency/RealEstateAgency.csproj
COPY RealEstateAgency/ RealEstateAgency/
COPY --from=client /client/dist client-app/dist/
RUN dotnet publish RealEstateAgency/RealEstateAgency.csproj --no-restore -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app /app
COPY integrations/security/supabase-ca.crt /app/certificates/supabase-ca.crt
ENV ASPNETCORE_HTTP_PORTS=8080 ASPNETCORE_ENVIRONMENT=Production PGSSLROOTCERT=/app/certificates/supabase-ca.crt
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "/app/RealEstateAgency.dll"]
