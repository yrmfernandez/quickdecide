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

const DEFAULT_TIME_ZONE = "Asia/Manila";

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
    "Get the current local hour and part of day. Defaults to Asia/Manila. Use when timing matters.",
  inputSchema: z.object({
    timeZone: z.string().default(DEFAULT_TIME_ZONE).describe("IANA timezone, e.g. Asia/Manila"),
  }),
  execute: async ({ timeZone }) => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
      weekday: "long",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? now.getHours());
    const dayOfWeek =
      parts.find((part) => part.type === "weekday")?.value ??
      now.toLocaleDateString("en-US", { weekday: "long", timeZone });
    const partOfDay =
      hour < 5 ? "late night" : hour < 11 ? "morning" : hour < 14 ? "midday" : hour < 18 ? "afternoon" : hour < 22 ? "evening" : "late night";
    return {
      iso: now.toISOString(),
      timeZone,
      dayOfWeek,
      hour,
      partOfDay,
      isWeekend: ["Saturday", "Sunday"].includes(dayOfWeek),
    };
  },
});

export const getDateContext = tool({
  description:
    "Get the exact current calendar date and weekday. Defaults to Asia/Manila. Use when dates, deadlines, weekends, or 'today/tomorrow' matter.",
  inputSchema: z.object({
    timeZone: z.string().default(DEFAULT_TIME_ZONE).describe("IANA timezone, e.g. Asia/Manila"),
  }),
  execute: async ({ timeZone }) => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      timeZone,
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now),
      dayOfWeek: new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "long",
      }).format(now),
    };
  },
});

export const compareSimpleCosts = tool({
  description:
    "Compare obvious cost hints from the user's options. Use only for broad cheap/moderate/expensive reasoning, not exact live prices.",
  inputSchema: z.object({
    choices: z.array(z.string()).min(2).describe("The extracted choices to compare."),
  }),
  execute: async ({ choices }) => {
    const cheap = /free|home|cook|leftover|walk|wait|study|sleep|water/i;
    const expensive = /order|delivery|restaurant|taxi|grab|buy|purchase|premium|hotel|flight/i;

    return choices.map((choice) => ({
      choice,
      broadCost:
        cheap.test(choice) && !expensive.test(choice)
          ? "likely cheaper"
          : expensive.test(choice)
            ? "likely costs money"
            : "cost unclear",
    }));
  },
});
