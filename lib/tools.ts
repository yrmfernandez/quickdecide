import { tool } from "ai";
import { z } from "zod";

/**
 * The Free Toolbelt — real-world context for Brain 2, at zero dollars.
 * - Open-Meteo: keyless weather API (geocoding + current conditions)
 * - Native JS Date: time/day context, no API at all
 */

const WMO_CODES: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  71: "slight snow",
  73: "moderate snow",
  75: "heavy snow",
  80: "rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "thunderstorm with heavy hail",
};

export const getWeather = tool({
  description:
    "Get current weather (temperature °C, precipitation, conditions) for a city. Use when the decision could be affected by weather (going out, food delivery, outdoor activities).",
  inputSchema: z.object({
    city: z.string().describe("City name, e.g. 'Davao City'"),
  }),
  execute: async ({ city }) => {
    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
        { signal: AbortSignal.timeout(4000) }
      );
      const geo = await geoRes.json();
      const place = geo?.results?.[0];
      if (!place) return { error: `Could not find city "${city}".` };

      const wxRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,precipitation,weather_code&timezone=auto`,
        { signal: AbortSignal.timeout(4000) }
      );
      const wx = await wxRes.json();
      const cur = wx?.current;
      if (!cur) return { error: "Weather data unavailable." };

      return {
        city: place.name,
        country: place.country,
        temperatureC: cur.temperature_2m,
        precipitationMm: cur.precipitation,
        conditions: WMO_CODES[cur.weather_code] ?? "unknown",
      };
    } catch {
      return { error: "Weather lookup failed — decide without it." };
    }
  },
});

export const getTimeContext = tool({
  description:
    "Get the current date, day of week, hour, and part of day. Use when timing matters (meal decisions, whether places are open, weekday vs weekend energy).",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();
    const hour = now.getHours();
    const partOfDay =
      hour < 5 ? "late night" : hour < 11 ? "morning" : hour < 14 ? "midday" : hour < 18 ? "afternoon" : hour < 22 ? "evening" : "late night";
    return {
      iso: now.toISOString(),
      dayOfWeek: now.toLocaleDateString("en-US", { weekday: "long" }),
      hour,
      partOfDay,
      isWeekend: [0, 6].includes(now.getDay()),
    };
  },
});
