using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using RealEstateAgency.BusinessLogicLayer;
using RealEstateAgency.PersistenceLayer;
using RealEstateAgency.PersistenceLayer.Entities;

var builder = WebApplication.CreateBuilder(args);

// Разрешаем запросы от React-приложения (CORS)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReact", policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

builder.Services.AddSingleton<JsonDataManager>(_ => new JsonDataManager("agency_data.json"));
builder.Services.AddSingleton<AgencyService>();

var app = builder.Build();
app.UseCors("AllowReact");

// ================= 1. НЕРУХОМІСТЬ ТА ФІЛЬТРИ =================
app.MapGet("/api/properties", (AgencyService s) => Results.Ok(s.GetAllProperties()));

app.MapPost("/api/properties/search", (AgencyService s, PropertySearchFilter filter) =>
    Results.Ok(s.SearchProperties(filter)));

app.MapPost("/api/properties", (AgencyService s, CreatePropertyDto dto) =>
{
    try
    {
        var prop = s.CreateProperty(dto.Type, dto.Area, dto.Address, dto.District, dto.Landmark, dto.Rooms, dto.Price, dto.Status, dto.YearBuilt, out var notifications);
        return Results.Ok(new { property = prop, notifications });
    }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapPut("/api/properties/{id}", (AgencyService s, string id, CreatePropertyDto dto) =>
{
    try
    {
        s.UpdateProperty(id, dto.Type, dto.Area, dto.Address, dto.District, dto.Landmark, dto.Rooms, dto.Price, dto.Status, dto.YearBuilt);
        return Results.Ok();
    }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapPatch("/api/properties/{id}/status", (AgencyService s, string id, ChangeStatusDto dto) =>
{
    try
    {
        s.ChangePropertyStatus(id, dto.NewStatus, dto.Comment);
        return Results.Ok();
    }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapDelete("/api/properties/{id}", (AgencyService s, string id) =>
{
    try { s.DeleteProperty(id); return Results.Ok(); }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

// ================= 2. КЛІЄНТИ, ПОШУКИ ТА СПОВІЩЕННЯ =================
app.MapGet("/api/clients", (AgencyService s) => Results.Ok(s.GetAllClients()));

app.MapPost("/api/clients", (AgencyService s, CreateClientDto dto) =>
{
    try { return Results.Ok(s.CreateClient(dto.Name, dto.ContactInfo, dto.Type)); }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapDelete("/api/clients/{id}", (AgencyService s, string id) =>
{
    try { s.DeleteClient(id); return Results.Ok(); }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapPost("/api/clients/{id}/searches", (AgencyService s, string id, SaveSearchDto dto) =>
{
    try { s.SaveClientSearch(id, dto.Title, dto.Filter); return Results.Ok(); }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

// ================= 3. РІЄЛТОРИ ТА УГОДИ =================
app.MapGet("/api/agents", (AgencyService s) => Results.Ok(s.GetAllAgents()));

app.MapPost("/api/agents", (AgencyService s, CreateAgentDto dto) =>
{
    try { return Results.Ok(s.CreateAgent(dto.Name, dto.ExperienceYears)); }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapDelete("/api/agents/{id}", (AgencyService s, string id) =>
{
    try { s.DeleteAgent(id); return Results.Ok(); }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapGet("/api/deals", (AgencyService s) => Results.Ok(s.GetAllDeals()));

app.MapPost("/api/deals", (AgencyService s, CreateDealDto dto) =>
{
    try { return Results.Ok(s.CreateDeal(dto.PropertyId, dto.ClientId, dto.AgentId, dto.Price, dto.DealType, dto.Commission)); }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapDelete("/api/deals/{id}", (AgencyService s, string id, string? reason) =>
{
    try { s.CancelDeal(id, reason ?? "Розірвання договору через веб-панель"); return Results.Ok(); }
    catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
});

// ================= 4. АНАЛІТИКА ТА СТАТИСТИКА (ЕТАП 3) =================
app.MapGet("/api/analytics", (AgencyService s, DateTime? startDate, DateTime? endDate) =>
{
    return Results.Ok(new
    {
        dealsCount = s.GetDealsByPeriod(startDate, endDate).Count,
        totalSales = s.GetTotalSalesAmount(startDate, endDate),
        totalProfit = s.GetTotalAgencyProfit(startDate, endDate),
        avgSqmCatalog = s.GetAveragePricePerSquareMeterAllProperties(),
        avgSqmDeals = s.GetAveragePricePerSquareMeterSoldDeals(),
        agentsPerformance = s.GetAgentsPerformance(),
        mostActiveClients = s.GetMostActiveClients()
    });
});

app.Run("http://localhost:5000");

// DTO-рекорди для прийому JSON із React
public record CreatePropertyDto(string Type, double Area, string Address, string District, string Landmark, int Rooms, decimal Price, PropertyStatus Status, int YearBuilt);
public record ChangeStatusDto(PropertyStatus NewStatus, string Comment);
public record CreateClientDto(string Name, string ContactInfo, ClientType Type);
public record SaveSearchDto(string Title, PropertySearchFilter Filter);
public record CreateAgentDto(string Name, int ExperienceYears);
public record CreateDealDto(string PropertyId, string ClientId, string AgentId, decimal Price, DealType DealType, decimal Commission);