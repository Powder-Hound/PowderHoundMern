import { ACCURACY_RESORTS } from "../../config/forecastAccuracyStations.js";
import { fetchCpcOutlook } from "./cpcOutlook.js";
import { fetchNwsForecast } from "./nwsForecast.js";
import { fetchOpenMeteo } from "./openMeteo.js";
import { fetchVisualCrossingForecast } from "./visualCrossingForecast.js";

export async function captureForecasts({
  resorts = ACCURACY_RESORTS,
  now = new Date(),
  env = process.env,
} = {}) {
  const rows = [];
  const errors = [];
  const vcReady = Boolean(env.VISUALCROSSING_KEY);
  if (!vcReady) {
    errors.push({
      resort: "*",
      source: "visual-crossing",
      message: "VISUALCROSSING_KEY is not set",
    });
  }

  for (const resort of resorts) {
    const jobs = [
      ["open-meteo", () => fetchOpenMeteo(resort, now)],
      ["nws", () => fetchNwsForecast(resort, now)],
      ["cpc", () => fetchCpcOutlook(resort, now)],
    ];
    if (vcReady) {
      jobs.push(["visual-crossing", () => fetchVisualCrossingForecast(resort, now, env)]);
    }
    const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
    settled.forEach((result, index) => {
      const source = jobs[index][0];
      if (result.status === "fulfilled") {
        rows.push(...result.value);
      } else {
        errors.push({
          resort: resort.resort,
          source,
          message: result.reason?.message || String(result.reason),
        });
      }
    });
  }

  return { rows, errors };
}
