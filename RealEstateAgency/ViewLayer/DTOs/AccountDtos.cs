namespace RealEstateAgency.DTOs;

public record LoginDto(string Username, string Password);
public record AssignRoleDto(string Role, Guid? AgentId, Guid? ClientId);
