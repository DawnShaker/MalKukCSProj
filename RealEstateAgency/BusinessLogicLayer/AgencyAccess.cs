using RealEstateAgency.PersistenceLayer.Entities;

namespace RealEstateAgency.BusinessLogicLayer;

// Все проверки владения записями собраны здесь, а не только в React.
public static class AgencyAccess
{
    public static void RequireManager(UserProfile user)
    {
        if (user.Role != "manager") throw new ApiException(403, "Ця дія доступна тільки менеджеру.");
    }

    public static void RequireStaff(UserProfile user)
    {
        if (user.Role != "manager" && !(user.Role == "agent" && user.AgentId.HasValue))
            throw new ApiException(403, "Ця дія недоступна для вашої ролі.");
    }

    public static bool CanSeeProperty(UserProfile user, Property property)
    {
        if (user.Role == "manager") return true;
        if (user.Role == "agent") return user.AgentId.HasValue && property.AgentId == user.AgentId;
        return user.Role == "client" && (property.Status == PropertyStatus.ForSale || property.Status == PropertyStatus.ForRent);
    }

    public static bool CanSeeClient(UserProfile user, Client client)
    {
        if (user.Role == "manager") return true;
        if (user.Role == "agent") return user.AgentId.HasValue && client.AgentId == user.AgentId;
        return user.Role == "client" && client.Id == user.ClientId;
    }

    public static void CheckProperty(UserProfile user, Property property)
    {
        RequireStaff(user);
        if (!CanSeeProperty(user, property)) throw new ApiException(404, "Об'єкт не знайдено.");
    }

    public static void CheckClient(UserProfile user, Client client)
    {
        if (!CanSeeClient(user, client)) throw new ApiException(404, "Клієнта не знайдено.");
    }

    public static void CheckDeal(UserProfile user, Deal deal)
    {
        RequireStaff(user);
        if (user.Role != "manager" && deal.AgentId != user.AgentId)
            throw new ApiException(404, "Угоду не знайдено.");
    }

    public static Guid? ResponsibleAgent(UserProfile user, Guid? requestedAgent)
    {
        RequireStaff(user);
        if (user.Role == "manager") return requestedAgent;
        if (requestedAgent.HasValue && requestedAgent != user.AgentId)
            throw new ApiException(403, "Агент може вести тільки власні записи.");
        return user.AgentId;
    }
}
