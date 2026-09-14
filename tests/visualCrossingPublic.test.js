import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("GET /api/visual-crossing/public", () => {
  it("is allow-listed without auth and registered before /:resortId", () => {
    const routes = readFileSync(join(root, "api/visualCrossing.routes.js"), "utf8");
    const publicIdx = routes.indexOf('"/public"');
    const listIdx = routes.indexOf('"/list"');
    const byIdIdx = routes.indexOf('"/:resortId"');

    assert.ok(publicIdx > 0, "GET /public must exist");
    assert.ok(listIdx > 0, "GET /list must exist");
    assert.ok(byIdIdx > 0, "GET /:resortId must exist");
    assert.ok(
      publicIdx < byIdIdx,
      "/public must be registered before /:resortId so Express does not treat public as a resortId"
    );

    const publicBlock = routes.match(
      /visualCrossingRouter\.get\(\s*"\/public",[\s\S]*?\n\);/
    )?.[0];
    const listBlock = routes.match(
      /visualCrossingRouter\.get\(\s*"\/list",[\s\S]*?\n\);/
    )?.[0];
    assert.ok(publicBlock);
    assert.ok(listBlock);
    assert.match(listBlock, /verifyToken/);
    assert.doesNotMatch(publicBlock, /verifyToken/);
    assert.match(publicBlock, /validateIds/);
    assert.match(publicBlock, /findListOfWeatherData/);
  });

  it("reads Mongo weather rows; live Visual Crossing still uses VISUALCROSSING_KEY", () => {
    const controller = readFileSync(
      join(root, "controllers/visual-crossing.controller.js"),
      "utf8"
    );
    const api = readFileSync(join(root, "externalAPI/visualCrossingAPI.js"), "utf8");

    assert.match(controller, /export const findListOfWeatherData/);
    assert.match(controller, /ResortWeatherData\.find/);
    assert.doesNotMatch(
      controller.slice(
        controller.indexOf("export const findListOfWeatherData"),
        controller.indexOf("export const getWeatherAlerts")
      ),
      /fetchVisualCrossing/
    );
    assert.match(api, /process\.env\.VISUALCROSSING_KEY/);
  });
});
