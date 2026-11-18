export const emptyFilter = {
  type: "",
  district: "",
  address: "",
  landmark: "",
  rooms: "",
  minArea: "",
  maxArea: "",
  minPrice: "",
  maxPrice: "",
  minYearBuilt: "",
  maxYearBuilt: "",
  status: "",
};
const fields = [
  ["type", "Тип нерухомості"],
  ["district", "Район"],
  ["address", "Адреса"],
  ["landmark", "Орієнтири"],
  ["rooms", "Кількість кімнат", "number"],
  ["minArea", "Площа від, м²", "number"],
  ["maxArea", "Площа до, м²", "number"],
  ["minPrice", "Ціна від, $", "number"],
  ["maxPrice", "Ціна до, $", "number"],
  ["minYearBuilt", "Рік побудови від", "number"],
  ["maxYearBuilt", "Рік побудови до", "number"],
];
export function filterPayload(value) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== "" && v != null)
      .map(([key, v]) => [
        key,
        ["type", "district", "address", "landmark"].includes(key)
          ? v
          : Number(v),
      ]),
  );
}
export default function SearchFilterFields({
  value,
  onChange,
  prefix = "search",
  includeClosed = false,
}) {
  return (
    <div className="filter-fields">
      {fields.map(([key, label, type]) => (
        <div className="field" key={key}>
          <label htmlFor={`${prefix}-${key}`}>{label}</label>
          <input
            id={`${prefix}-${key}`}
            name={key}
            type={type || "text"}
            min={type === "number" ? 0 : undefined}
            step={
              ["minPrice", "maxPrice", "minArea", "maxArea"].includes(key)
                ? "any"
                : undefined
            }
            value={value[key] ?? ""}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </div>
      ))}
      <div className="field">
        <label htmlFor={`${prefix}-status`}>Статус</label>
        <select
          id={`${prefix}-status`}
          name="status"
          value={value.status ?? ""}
          onChange={(e) => onChange({ ...value, status: e.target.value })}
        >
          <option value="">Всі доступні</option>
          <option value="1">На продаж</option>
          <option value="2">Оренда</option>
          {includeClosed && (
            <>
              <option value="3">Заброньовано</option>
              <option value="4">Продано</option>
            </>
          )}
        </select>
      </div>
    </div>
  );
}
