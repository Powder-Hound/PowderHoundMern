import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPowderAlertSms,
  estimateSmsSegments,
  isGsm7,
  splitAggregatedMessages,
} from "../utils/smsUtils.js";
import {
  EXPECTED_THREE_HILL_SMS,
  VAIL_ASPEN_PARK_CITY_ALERTS,
} from "./fixtures/powderAlertSms.js";

const FORBIDDEN_SMS_SNIPPETS = [
  "Book Now",
  "No lodging links available",
  "PowAlert Extravaganza",
  "Hello PowAlert",
  "Happy slopes",
  "For more live weather updates",
  "expedia.com",
  "🏨",
  "❄️",
  "🔥",
  "→",
];

describe("buildPowderAlertSms", () => {
  it("builds one short GSM-7 body for Vail / Aspen / Park City with a single dashboard URL", () => {
    const body = buildPowderAlertSms(VAIL_ASPEN_PARK_CITY_ALERTS);
    const estimate = estimateSmsSegments(body);
    const segments = splitAggregatedMessages([body]);

    console.log("SAMPLE SMS (3 hills):", body);
    console.log("SMS SEGMENT ESTIMATE:", estimate);

    assert.equal(body, EXPECTED_THREE_HILL_SMS);
    assert.equal(body.length <= 160, true);
    assert.equal(isGsm7(body), true);
    assert.equal(estimate.encoding, "gsm7");
    assert.equal(estimate.segments, 1);
    assert.equal(segments.length, 1);
    assert.equal(segments[0], body);
    assert.equal((body.match(/https:\/\/powalert\.com\/dashboard/g) || []).length, 1);

    for (const snippet of FORBIDDEN_SMS_SNIPPETS) {
      assert.equal(
        body.includes(snippet),
        false,
        `SMS must not include ${JSON.stringify(snippet)}`
      );
    }
  });

  it("formats a single hill", () => {
    const body = buildPowderAlertSms([VAIL_ASPEN_PARK_CITY_ALERTS[1]]);
    const expected =
      'PowAlert: Vail 18" Sat. Open -> https://powalert.com/dashboard';
    const estimate = estimateSmsSegments(body);

    console.log("SAMPLE SMS (1 hill):", body);
    console.log("SMS SEGMENT ESTIMATE:", estimate);

    assert.equal(body, expected);
    assert.equal(estimate.segments, 1);
    assert.equal(isGsm7(body), true);
  });

  it("keeps top 3 hills and +k more when more than 3 resorts alert", () => {
    const alerts = [
      ...VAIL_ASPEN_PARK_CITY_ALERTS,
      {
        resortId: "resort-copper",
        resortName: "Copper",
        snowfall: 8,
        alertDate: new Date("2026-02-14T00:00:00.000Z"),
      },
      {
        resortId: "resort-breck",
        resortName: "Breckenridge",
        snowfall: 9,
        alertDate: new Date("2026-02-14T00:00:00.000Z"),
      },
    ];
    const body = buildPowderAlertSms(alerts);
    const expected =
      'PowAlert: Vail 18", Aspen 14", Park City 12" +2 more Sat. Open -> https://powalert.com/dashboard';
    const estimate = estimateSmsSegments(body);

    console.log("SAMPLE SMS (5 hills):", body);
    console.log("SMS SEGMENT ESTIMATE:", estimate);

    assert.equal(body, expected);
    assert.equal(estimate.segments, 1);
    assert.equal(isGsm7(body), true);
    assert.equal(body.includes("Copper"), false);
    assert.equal(body.includes("Breckenridge"), false);
  });

  it("collapses multiple forecast days at one resort to the max inches", () => {
    const body = buildPowderAlertSms([
      {
        resortId: "resort-vail",
        resortName: "Vail",
        snowfall: 10,
        alertDate: new Date("2026-02-15T00:00:00.000Z"),
      },
      {
        resortId: "resort-vail",
        resortName: "Vail",
        snowfall: 18,
        alertDate: new Date("2026-02-14T00:00:00.000Z"),
      },
    ]);
    assert.equal(
      body,
      'PowAlert: Vail 18" Sat. Open -> https://powalert.com/dashboard'
    );
    assert.equal(body.includes("10"), false);
  });

  it("stays at 1 GSM-7 segment while a Unicode arrow body would be 2 UCS-2 segments", () => {
    const body = buildPowderAlertSms(VAIL_ASPEN_PARK_CITY_ALERTS);
    const unicodeArrowBody = body.replace("->", "→");
    const gsm = estimateSmsSegments(body);
    const ucs2 = estimateSmsSegments(unicodeArrowBody);

    console.log("GSM-7 BODY SEGMENTS:", gsm.segments, gsm);
    console.log("UNICODE ARROW BODY SEGMENTS:", ucs2.segments, ucs2);

    assert.equal(gsm.encoding, "gsm7");
    assert.equal(gsm.segments, 1);
    assert.equal(ucs2.encoding, "ucs2");
    assert.equal(ucs2.segments, 2);
  });
});
