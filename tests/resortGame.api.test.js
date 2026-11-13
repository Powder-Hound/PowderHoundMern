import assert from "node:assert/strict";
import express from "express";
import { after, describe, it } from "node:test";
import { createResortGameRouter } from "../api/resortGame.routes.js";
import { memoryStore } from "../game/store.js";
import { syntheticDay } from "../game/weather.js";

const RESORT_ID = "66eb1b97cbd1c8aacee63a79";

function resorts() {
  return {
    async findById(id) {
      if (String(id) !== RESORT_ID) return null;
      return {
        _id: RESORT_ID,
        resortName: "Cherry Peak Resort",
        State: "Utah",
      };
    },
  };
}

function weatherFactory(mode = "ok") {
  return async function weather(_resortId, date) {
    if (mode === "throw") throw new Error("forecast down");
    if (mode === "missing") return null;
    return syntheticDay(date, {
      snowDepthCm: 45,
      humidity: null,
      tempMinC: -10,
      tempAvgC: -6,
      tempMaxC: -1,
    });
  };
}

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return server;
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("resort game HTTP API", () => {
  const servers = [];
  after(async () => {
    await Promise.all(servers.map((server) => close(server)));
  });

  async function start(router) {
    const app = express();
    app.use(express.json());
    app.use("/api/resort-game", router);
    const server = await listen(app);
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }

  it("returns 404 for every route when the flag is off, before auth", async () => {
    const base = await start(createResortGameRouter({
      isEnabled: () => false,
      authenticate: (_req, _res, next) => next(),
      store: memoryStore(),
      resorts: resorts(),
      weather: weatherFactory(),
    }));
    const response = await fetch(`${base}/api/resort-game`, { method: "POST" });
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.message, "Not found");
  });

  it("asks for a token when the flag is on", async () => {
    const base = await start(createResortGameRouter({
      isEnabled: () => true,
      store: memoryStore(),
      resorts: resorts(),
      weather: weatherFactory(),
    }));
    const response = await fetch(`${base}/api/resort-game`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 401);
  });

  it("creates a game, resolves a day, and hides it from another user", async () => {
    const store = memoryStore();
    const base = await start(createResortGameRouter({
      isEnabled: () => true,
      authenticate(req, _res, next) {
        req.userID = req.headers["x-user"] || "player-a";
        next();
      },
      store,
      resorts: resorts(),
      weather: async () => {
        throw new Error("forecast down");
      },
      today: () => "2026-11-13",
    }));
    const created = await fetch(`${base}/api/resort-game`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user": "player-a" },
      body: JSON.stringify({ resortId: RESORT_ID, seed: 11 }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    const state = createdBody.data;
    assert.equal(state.resort.name, "Cherry Peak Resort");
    assert.equal(state.resort.region, "Rocky Mountain");
    assert.equal(state.calendar.daysInSeason, 84);
    assert.equal(state.calendar.status, "awaiting_decisions");
    assert.equal(state.conditions.snowDepthCm, 0);
    assert.equal(state.forecast[0].source, "missing");
    assert.ok(state.bounds.liftTicketPrice.max >= state.bounds.liftTicketPrice.anchor);
    assert.equal(state.prefill.bigBet, null);

    const missing = await fetch(`${base}/api/resort-game`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user": "player-a" },
      body: JSON.stringify({ resortId: "66eb1b97cbd1c8aacee63a00" }),
    });
    assert.equal(missing.status, 404);

    const other = await fetch(`${base}/api/resort-game/${state.gameId}`, {
      headers: { "x-user": "player-b" },
    });
    assert.equal(other.status, 404);

    const bad = await fetch(`${base}/api/resort-game/${state.gameId}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user": "player-a" },
      body: JSON.stringify({ ...state.prefill, liftTicketPrice: -5 }),
    });
    assert.equal(bad.status, 400);
    const badBody = await bad.json();
    assert.equal(badBody.errors[0].field, "liftTicketPrice");

    const played = await fetch(`${base}/api/resort-game/${state.gameId}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user": "player-a" },
      body: JSON.stringify(state.prefill),
    });
    assert.equal(played.status, 200);
    const playedBody = await played.json();
    assert.ok(playedBody.data.result.weather.impacts.includes("forecast_missing"));
    assert.equal(playedBody.data.result.date, state.calendar.currentDate);
    assert.equal(playedBody.data.state.calendar.dayIndex, 1);
    assert.ok(playedBody.data.result.visits.total <= state.resort.comfortableCapacity);
    assert.ok(playedBody.data.result.satisfaction >= 0);
    assert.ok(playedBody.data.result.satisfaction <= 100);
    assert.ok(Number.isFinite(playedBody.data.result.profit));

    const history = await fetch(`${base}/api/resort-game/${state.gameId}/days`, {
      headers: { "x-user": "player-a" },
    });
    const historyBody = await history.json();
    assert.equal(historyBody.data.length, 1);
    assert.equal(historyBody.data[0].date, state.calendar.currentDate);
  });
});
