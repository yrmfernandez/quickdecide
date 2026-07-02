type ToolResultLike = {
  toolName: string;
  output: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatWeather(output: unknown): string | null {
  if (!isRecord(output)) return null;
  if (typeof output.error === "string") return output.error;

  const city = typeof output.city === "string" ? output.city : "the selected city";
  const country = typeof output.country === "string" ? `, ${output.country}` : "";
  const temperature =
    typeof output.temperatureC === "number" ? `${Math.round(output.temperatureC)}C` : null;
  const conditions = typeof output.conditions === "string" ? output.conditions : null;
  const precipitation =
    typeof output.precipitationMm === "number" ? `${output.precipitationMm} mm precipitation` : null;

  const parts = [temperature, conditions, precipitation].filter(Boolean);
  if (parts.length === 0) return null;
  return `Weather in ${city}${country}: ${parts.join(", ")}.`;
}

function formatTime(output: unknown): string | null {
  if (!isRecord(output)) return null;

  const dayOfWeek = typeof output.dayOfWeek === "string" ? output.dayOfWeek : null;
  const partOfDay = typeof output.partOfDay === "string" ? output.partOfDay : null;
  const hour = typeof output.hour === "number" ? `${output.hour}:00` : null;
  const timeZone = typeof output.timeZone === "string" ? output.timeZone : null;

  const parts = [dayOfWeek, partOfDay, hour, timeZone].filter(Boolean);
  if (parts.length === 0) return null;
  return `Current time context: ${parts.join(", ")}.`;
}

function formatDate(output: unknown): string | null {
  if (!isRecord(output)) return null;

  const date = typeof output.date === "string" ? output.date : null;
  const dayOfWeek = typeof output.dayOfWeek === "string" ? output.dayOfWeek : null;
  const timeZone = typeof output.timeZone === "string" ? output.timeZone : null;

  const parts = [date, dayOfWeek, timeZone].filter(Boolean);
  if (parts.length === 0) return null;
  return `Current date context: ${parts.join(", ")}.`;
}

function formatCost(output: unknown): string | null {
  if (!Array.isArray(output)) return null;
  const parts = output
    .filter(isRecord)
    .map((item) => {
      const choice = typeof item.choice === "string" ? item.choice : null;
      const broadCost = typeof item.broadCost === "string" ? item.broadCost : null;
      return choice && broadCost ? `${choice}: ${broadCost}` : null;
    })
    .filter(Boolean);

  if (parts.length === 0) return null;
  return `Broad cost context: ${parts.join("; ")}.`;
}

export function formatActualToolContext(results: ToolResultLike[]): string[] {
  const context = results
    .map((result) => {
      if (result.toolName === "getWeather") return formatWeather(result.output);
      if (result.toolName === "getTimeContext") return formatTime(result.output);
      if (result.toolName === "getDateContext") return formatDate(result.output);
      if (result.toolName === "compareSimpleCosts") return formatCost(result.output);
      return null;
    })
    .filter((item): item is string => Boolean(item));

  return [...new Set(context)];
}
