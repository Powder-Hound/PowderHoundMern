import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  ingestCoordinatesForResorts,
  publicForecastPoint,
  selectIngestCoordinates,
} from "../utils/forecastPoint.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const parkCity = {
  resortName: "Park City Mountain Resort",
  Latitude: 40.6514,
  Longitude: -111.5077,
};

describe("selectIngestCoordinates", () => {
  it("uses the forecast point when lat and lon are present", () => {
    const selected = selectIngestCoordinates({
      ...parkCity,
      forecastPoint: {
        lat: 40.6442644,
        lon: -111.5385011,
        elevationFt: 8389,
        label: "mid-mountain",
        source: "OpenStreetMap way 398430290",
      },
    });
    assert.deepEqual(selected, {
      lat: 40.6442644,
      lon: -111.5385011,
      usedForecastPoint: true,
    });
  });

  it("falls back to the stored base coordinates when forecastPoint is missing", () => {
    assert.deepEqual(selectIngestCoordinates(parkCity), {
      lat: 40.6514,
      lon: -111.5077,
      usedForecastPoint: false,
    });
    assert.deepEqual(selectIngestCoordinates({ ...parkCity, forecastPoint: null }), {
      lat: 40.6514,
      lon: -111.5077,
      usedForecastPoint: false,
    });
  });

  it("falls back when the forecast point is only partly set or not numeric", () => {
    assert.equal(
      selectIngestCoordinates({
        ...parkCity,
        forecastPoint: { lat: 40.64, label: "mid-mountain" },
      }).usedForecastPoint,
      false
    );
    assert.equal(
      selectIngestCoordinates({
        ...parkCity,
        forecastPoint: { lat: "nope", lon: -111.5 },
      }).usedForecastPoint,
      false
    );
  });

  it("returns one coordinate pair per resort, so ingest call count does not grow", () => {
    const resorts = [
      parkCity,
      {
        ...parkCity,
        resortName: "Alta Ski Area",
        forecastPoint: { lat: 40.5745018, lon: -111.6238689 },
      },
      { ...parkCity, resortName: "Vail", forecastPoint: {} },
    ];
    const selected = ingestCoordinatesForResorts(resorts);
    assert.equal(selected.length, resorts.length);
    assert.equal(selected.filter((point) => point.usedForecastPoint).length, 1);
  });
});

describe("publicForecastPoint", () => {
  it("exposes elevation and the mid-mountain label", () => {
    assert.deepEqual(
      publicForecastPoint({
        forecastPoint: { elevationFt: 8389, label: "mid-mountain", lat: 1, lon: 2 },
      }),
      { elevationFt: 8389, label: "mid-mountain" }
    );
  });

  it("returns null when the resort has no forecast elevation", () => {
    assert.equal(publicForecastPoint({}), null);
    assert.equal(publicForecastPoint({ forecastPoint: { label: "mid-mountain" } }), null);
  });
});

describe("daily ingest still calls Visual Crossing once per resort", () => {
  it("updateWeatherData fetches the selected point and still matches the base resort", () => {
    const source = readFileSync(join(root, "utils/updateWeatherData.js"), "utf8");
    assert.equal(source.match(/fetchFn\(/g).length, 1);
    assert.match(source, /selectIngestCoordinates\(resort\)/);
    assert.match(source, /fetchFn\(point\.lat, point\.lon\)/);
    assert.match(source, /Resort\.findById\(resort\.resortId\)/);
    assert.match(source, /Latitude: resort\.Latitude/);
    assert.doesNotMatch(source, /Latitude: point\.lat/);
  });

  it("the resort query used by the cron includes forecastPoint", () => {
    const source = readFileSync(join(root, "utils/mongoResortHelper.js"), "utf8");
    assert.match(source, /forecastPoint: 1/);
  });
});
