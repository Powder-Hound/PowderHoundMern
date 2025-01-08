import { getAllVisualCrossingData } from "./visualCrossingChron.js";
import cron from "node-cron";

export const apiScheduler = cron.schedule("*/2 * * *", async () => {
  await getAllNOAAData();
  await getAllWeatherBitData();
  await getAllVisualCrossingData();
});

export const notifyScheduler = cron.schedule("* * *", () => {});
