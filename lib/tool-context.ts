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

  const parts = [dayOfWeek, partOfDay, hour].filter(Boolean);
  if (parts.length === 0) return null;
  return `Current time context: ${parts.join(", ")}.`;
}

export function formatActualToolContext(results: ToolResultLike[]): string[] {
  const context = results
    .map((result) => {
      if (result.toolName === "getWeather") return formatWeather(result.output);
      if (result.toolName === "getTimeContext") return formatTime(result.output);
      return null;
    })
    .filter((item): item is string => Boolean(item));

  return [...new Set(context)];
}
