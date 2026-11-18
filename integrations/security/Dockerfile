FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Security/Security.csproj Security/
RUN dotnet restore Security/Security.csproj
COPY Security/ Security/
RUN dotnet publish Security/Security.csproj --no-restore -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN mkdir /data && chown app:app /data
WORKDIR /data
COPY --from=build /app /app
ENV ASPNETCORE_HTTP_PORTS=8080 ASPNETCORE_ENVIRONMENT=Production
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "/app/Security.dll"]
