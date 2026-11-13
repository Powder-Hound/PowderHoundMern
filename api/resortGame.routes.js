import express from "express";
import { createGameHandlers } from "../controllers/resortGame.controller.js";
import { isResortGameEnabled } from "../game/flag.js";
import { mongoStore } from "../game/store.js";
import { createLiveWeatherProvider } from "../game/weather.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { Resort } from "../models/resorts.model.js";

export function createResortGameRouter(deps = {}) {
  const router = express.Router();
  const isEnabled = deps.isEnabled ?? (() => isResortGameEnabled());
  const authenticate = deps.authenticate ?? verifyToken;
  const handlers = createGameHandlers({
    store: deps.store ?? mongoStore,
    resorts: deps.resorts ?? Resort,
    weather: deps.weather ?? createLiveWeatherProvider(ResortWeatherData),
    today: deps.today,
  });

  router.use((req, res, next) => {
    if (!isEnabled()) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return next();
  });
  router.use(authenticate);

  router.post("/", handlers.create);
  router.get("/:gameId/days", handlers.days);
  router.get("/:gameId", handlers.get);
  router.post("/:gameId/decisions", handlers.decide);
  return router;
}

const resortGameRouter = createResortGameRouter();
export default resortGameRouter;
