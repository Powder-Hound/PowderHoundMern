import mongoose from "mongoose";
import { addDays, defaultSeasonStart } from "../game/calendar.js";
import { validateDecisions } from "../game/decisions.js";
import { E } from "../game/economics.config.js";
import { buildProfile } from "../game/resortProfile.js";
import { hashSeed, UINT32_MAX } from "../game/rng.js";
import {
  createInitialState,
  publicState,
  resolveDay,
  suggestedDecisions,
} from "../game/simulate.js";
import { kmhToMph, missingWeather, snowmakingWindow } from "../game/weather.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function forecastView(day) {
  const window = snowmakingWindow(day);
  return {
    date: day.date,
    source: day.source,
    reason: day.reason ?? null,
    snowfallCm: day.snowfallCm,
    snowDepthCm: day.snowDepthCm,
    tempMinC: day.tempMinC,
    tempAvgC: day.tempAvgC,
    tempMaxC: day.tempMaxC,
    windMph: kmhToMph(day.windKmh),
    windGustMph: kmhToMph(day.windGustKmh),
    precipMm: day.precipMm,
    precipType: day.precipType,
    rain: day.rain,
    conditions: day.conditions,
    snowmaking: {
      open: window.open,
      efficiency: window.efficiency,
      wetBulbF: window.wetBulbF,
      method: window.method,
    },
  };
}

async function loadForecast(weather, resortId, startDate) {
  if (!startDate) return [];
  const days = [];
  for (let i = 0; i < E.forecastHorizonDays; i += 1) {
    const date = addDays(startDate, i);
    try {
      const day = await weather(resortId, date);
      days.push(forecastView(day || missingWeather(date)));
    } catch {
      days.push(forecastView(missingWeather(date, "forecast_lookup_failed")));
    }
  }
  return days;
}

function owned(state, userId) {
  return state && String(state.userId) === String(userId);
}

export function createGameHandlers({ store, resorts, weather, today }) {
  const clock = today || (() => new Date().toISOString().slice(0, 10));

  return {
    async create(req, res) {
      try {
        const resortId = req.body?.resortId;
        if (!resortId || !mongoose.Types.ObjectId.isValid(resortId)) {
          return res.status(400).json({ success: false, message: "resortId must be a resort id" });
        }
        const resort = await resorts.findById(resortId);
        if (!resort) {
          return res.status(404).json({ success: false, message: "Resort not found" });
        }
        let startDate = req.body?.startDate;
        if (startDate == null || startDate === "") startDate = defaultSeasonStart(clock());
        if (!DATE.test(startDate)) {
          return res.status(400).json({ success: false, message: "startDate must be YYYY-MM-DD" });
        }
        let seed;
        if (req.body?.seed == null || req.body.seed === "") {
          seed = hashSeed(`${resortId}|${startDate}`);
        } else {
          const parsed = Number(req.body.seed);
          if (!Number.isInteger(parsed) || parsed < 0 || parsed > UINT32_MAX) {
            return res.status(400).json({
              success: false,
              message: `seed must be an integer from 0 to ${UINT32_MAX}`,
            });
          }
          seed = parsed;
        }
        const profile = buildProfile(resort, startDate);
        let opening = missingWeather(startDate);
        try {
          opening = (await weather(String(resort._id), startDate)) || opening;
        } catch {
          opening = missingWeather(startDate, "forecast_lookup_failed");
        }
        const initialDepthCm = opening.snowDepthCm == null ? 0 : opening.snowDepthCm;
        const state = createInitialState({
          profile,
          startDate,
          seed,
          userId: req.userID,
          initialDepthCm,
        });
        const saved = await store.create(state);
        const forecast = await loadForecast(weather, String(resort._id), startDate);
        const prefill = suggestedDecisions(saved, forecast[0] || opening);
        return res.status(201).json({
          success: true,
          data: publicState(saved, { forecast, prefill }),
        });
      } catch (error) {
        console.error("resort game create:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
      }
    },

    async get(req, res) {
      try {
        const state = await store.findById(req.params.gameId);
        if (!owned(state, req.userID)) {
          return res.status(404).json({ success: false, message: "Game not found" });
        }
        const forecast = await loadForecast(
          weather,
          state.profile.powalertResortId,
          state.calendar.currentDate
        );
        const prefill =
          state.calendar.status === "closed"
            ? null
            : suggestedDecisions(state, forecast[0] || missingWeather(state.calendar.currentDate));
        return res.status(200).json({
          success: true,
          data: publicState(state, { forecast, prefill }),
        });
      } catch (error) {
        console.error("resort game get:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
      }
    },

    async days(req, res) {
      try {
        const state = await store.findById(req.params.gameId);
        if (!owned(state, req.userID)) {
          return res.status(404).json({ success: false, message: "Game not found" });
        }
        const days = await store.listDays(state.gameId);
        return res.status(200).json({ success: true, data: days });
      } catch (error) {
        console.error("resort game days:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
      }
    },

    async decide(req, res) {
      try {
        const state = await store.findById(req.params.gameId);
        if (!owned(state, req.userID)) {
          return res.status(404).json({ success: false, message: "Game not found" });
        }
        if (state.calendar.status === "closed") {
          return res.status(409).json({ success: false, message: "Season closed" });
        }
        const check = validateDecisions(state, req.body);
        if (!check.ok) {
          return res.status(400).json({
            success: false,
            message: "Decisions out of bounds",
            errors: check.errors,
          });
        }
        let dayWeather;
        try {
          dayWeather = await weather(state.profile.powalertResortId, state.calendar.currentDate);
        } catch {
          dayWeather = null;
        }
        if (!dayWeather) dayWeather = missingWeather(state.calendar.currentDate, "forecast_lookup_failed");
        const played = resolveDay(state, check.decisions, dayWeather);
        if (!played.ok) {
          return res.status(409).json({ success: false, message: "Season closed" });
        }
        await store.save(played.state);
        await store.addDay({
          gameId: played.state.gameId,
          userId: played.state.userId,
          dayIndex: played.result.dayIndex,
          date: played.result.date,
          decisions: played.result.decisions,
          result: played.result,
        });
        const forecast = await loadForecast(
          weather,
          played.state.profile.powalertResortId,
          played.state.calendar.currentDate
        );
        const prefill =
          played.state.calendar.status === "closed"
            ? null
            : suggestedDecisions(
                played.state,
                forecast[0] || missingWeather(played.state.calendar.currentDate)
              );
        return res.status(200).json({
          success: true,
          data: {
            state: publicState(played.state, { forecast, prefill }),
            result: played.result,
          },
        });
      } catch (error) {
        console.error("resort game decide:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
      }
    },
  };
}
