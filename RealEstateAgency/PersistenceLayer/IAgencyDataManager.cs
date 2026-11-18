namespace RealEstateAgency.PersistenceLayer;

public interface IAgencyDataManager
{
    AgencyDataContext LoadData();
    void SaveData(AgencyDataContext context);
}
