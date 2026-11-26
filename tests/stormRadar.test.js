import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { Notification } from "../models/notification.model.js";
import { StormAlertState } from "../models/stormAlertState.model.js";
import { isGsm7 } from "../utils/smsUtils.js";
import {
  addUtcDays,
  buildStormMessages,
  daysBetween,
  formatStormDate,
  groupQualifyingDays,
  planMorningAlert,
  stormsForResort,
  utcDay,
} from "../utils/stormRadar.js";

const root = dirname(fileURLToPath(import.meta.url));
const LODGING_SNIPPETS = [
  "Book Now",
  "No lodging links available",
  "expedia",
  "🏨",
  "❄️",
  "🔥",
  "→",
];

function storm({
  resortId,
  resortName,
  start,
  end = start,
  inches,
  total = inches,
  now,
}) {
  const startDay = utcDay(start);
  const endDay = utcDay(end);
  return {
    resortId,
    resortName,
    start: startDay,
    end: endDay,
    peakDate: startDay,
    peakInches: inches,
    totalInches: total,
    leadDays: daysBetween(now, startDay),
  };
}

function sendsOn(log) {
  return log.filter((entry) => entry.send);
}

describe("storm grouping", () => {
  it("groups day 15 + day 16 as one storm and stays silent on a below-threshold day 14", () => {
    const storms = groupQualifyingDays(
      [
        { date: "2026-12-14", inches: 11 },
        { date: "2026-12-16", inches: 14 },
        { date: "2026-12-15", inches: 18 },
      ],
      12
    );

    assert.equal(storms.length, 1);
    assert.equal(storms[0].start.toISOString(), "2026-12-15T00:00:00.000Z");
    assert.equal(storms[0].end.toISOString(), "2026-12-16T00:00:00.000Z");
    assert.equal(storms[0].peakInches, 18);
    assert.equal(storms[0].totalInches, 32);
    assert.equal(
      storms[0].days.some((day) => day.date.toISOString().startsWith("2026-12-14")),
      false
    );
  });

  it("keeps a single skipped day inside the storm and splits on two skipped days", () => {
    const oneGap = groupQualifyingDays(
      [
        { date: "2026-12-15", inches: 12 },
        { date: "2026-12-16", inches: 4 },
        { date: "2026-12-17", inches: 16 },
      ],
      12
    );
    assert.equal(oneGap.length, 1);
    assert.equal(oneGap[0].start.toISOString(), "2026-12-15T00:00:00.000Z");
    assert.equal(oneGap[0].end.toISOString(), "2026-12-17T00:00:00.000Z");

    const twoGap = groupQualifyingDays(
      [
        { date: "2026-12-15", inches: 12 },
        { date: "2026-12-18", inches: 16 },
      ],
      12
    );
    assert.equal(twoGap.length, 2);
  });

  it("drops days before today when building a resort storm", () => {
    const storms = stormsForResort(
      {
        resortId: "alta",
        resortName: "Alta",
        days: [
          { date: "2026-12-01", inches: 20 },
          { date: "2026-12-02", inches: 15 },
        ],
      },
      12,
      "2026-12-02"
    );
    assert.equal(storms.length, 1);
    assert.equal(storms[0].start.toISOString(), "2026-12-02T00:00:00.000Z");
    assert.equal(storms[0].leadDays, 0);
  });
});

describe("three-band morning rule", () => {
  it("sends day-15 watch, stays silent day 14 and 13, reminds on day 12, then lock-in", () => {
    const start = "2026-12-16";
    let states = [];
    const log = [];

    for (let lead = 15; lead >= 0; lead -= 1) {
      const now = addUtcDays(start, -lead);
      const storms = [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start,
          inches: 14,
          now,
        }),
      ];
      const plan = planMorningAlert(storms, states, now);
      log.push({
        lead,
        send: plan.send,
        reason: plan.triggered[0]?.reason ?? null,
      });
      states = plan.nextStates;
    }

    const sent = sendsOn(log);
    assert.deepEqual(
      sent.map((entry) => entry.lead),
      [15, 12, 5]
    );
    assert.deepEqual(
      sent.map((entry) => entry.reason),
      ["new", "checkpoint", "checkpoint"]
    );
    assert.equal(log.find((entry) => entry.lead === 14).send, false);
    assert.equal(log.find((entry) => entry.lead === 13).send, false);
    assert.equal(log.filter((entry) => entry.send).length, 3);
  });

  it("does not treat a storm 16 days out as new, then sends when it reaches day 15", () => {
    const start = "2026-12-17";
    const tooEarly = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start,
          inches: 18,
          now: "2026-12-01",
        }),
      ],
      [],
      "2026-12-01"
    );
    assert.equal(daysBetween("2026-12-01", start), 16);
    assert.equal(tooEarly.send, false);
    assert.equal(tooEarly.nextStates[0].lastShownAt, null);

    const onWatch = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start,
          inches: 18,
          now: "2026-12-02",
        }),
      ],
      tooEarly.nextStates,
      "2026-12-02"
    );
    assert.equal(onWatch.send, true);
    assert.equal(onWatch.triggered[0].reason, "new");
    assert.equal(onWatch.triggered[0].leadDays, 15);
  });

  it("sends one message: Breck under New and Alta under Other, and resets Alta's clock", () => {
    const altaStart = "2026-12-16";
    const day15 = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start: altaStart,
          inches: 18,
          now: "2026-12-01",
        }),
      ],
      [],
      "2026-12-01"
    );
    assert.equal(day15.send, true);
    assert.equal(day15.triggered[0].resortName, "Alta");
    assert.equal(day15.monitoring.length, 0);

    const day14 = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start: altaStart,
          inches: 18,
          now: "2026-12-02",
        }),
        storm({
          resortId: "breck",
          resortName: "Breck",
          start: altaStart,
          inches: 16,
          now: "2026-12-02",
        }),
      ],
      day15.nextStates,
      "2026-12-02"
    );

    assert.equal(day14.send, true);
    assert.deepEqual(
      day14.triggered.map((item) => item.resortName),
      ["Breck"]
    );
    assert.equal(day14.triggered[0].reason, "new");
    assert.deepEqual(
      day14.monitoring.map((item) => item.resortName),
      ["Alta"]
    );
    const altaState = day14.nextStates.find((item) => item.resortId === "alta");
    assert.equal(altaState.lastShownAt.toISOString(), "2026-12-02T00:00:00.000Z");

    const day13 = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start: altaStart,
          inches: 18,
          now: "2026-12-03",
        }),
      ],
      day14.nextStates,
      "2026-12-03"
    );
    assert.equal(day13.send, false);

    // Without the Dec 2 reset, Dec 4 would be 3 days after the day-15 watch
    // and would send the plan reminder. The reset keeps that morning quiet.
    const day12 = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start: altaStart,
          inches: 18,
          now: "2026-12-04",
        }),
      ],
      day13.nextStates,
      "2026-12-04"
    );
    assert.equal(daysBetween("2026-12-02", "2026-12-04"), 2);
    assert.equal(day12.send, false);

    const day11 = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start: altaStart,
          inches: 18,
          now: "2026-12-05",
        }),
      ],
      day12.nextStates,
      "2026-12-05"
    );
    assert.equal(day11.send, true);
    assert.equal(day11.triggered[0].reason, "checkpoint");
    assert.equal(day11.triggered[0].leadDays, 11);
  });
});

describe("big upgrade trigger", () => {
  const start = "2026-12-11";
  const shown = {
    resortId: "alta",
    stormStart: utcDay(start),
    stormEnd: utcDay(start),
    lastShownAt: utcDay("2026-12-01"),
    lastShownInches: 20,
    lastShownBand: "plan",
  };

  function at(now, inches) {
    return planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start,
          inches,
          now,
        }),
      ],
      [shown],
      now
    );
  }

  it("fires on +6 inches or +50% after a 2-day gap", () => {
    assert.equal(at("2026-12-02", 26).send, false);
    assert.equal(at("2026-12-02", 30).send, false);

    const plusSix = at("2026-12-03", 26);
    assert.equal(plusSix.send, true);
    assert.equal(plusSix.triggered[0].reason, "upgrade");

    const plusHalf = at("2026-12-03", 30);
    assert.equal(plusHalf.send, true);
    assert.equal(plusHalf.triggered[0].reason, "upgrade");

    assert.equal(at("2026-12-03", 24).send, false);
  });

  it("waives the 2-day gap when the storm starts within 3 days", () => {
    const nearStart = "2026-12-04";
    const blocked = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start: nearStart,
          inches: 26,
          now: "2026-12-02",
        }),
      ],
      [
        {
          ...shown,
          stormStart: utcDay(nearStart),
          stormEnd: utcDay(nearStart),
          lastShownBand: "lock_in",
        },
      ],
      "2026-12-02"
    );
    assert.equal(daysBetween("2026-12-02", nearStart), 2);
    assert.equal(blocked.send, true);
    assert.equal(blocked.triggered[0].reason, "upgrade");
  });

  it("does not label the first crossing as an upgrade", () => {
    const plan = planMorningAlert(
      [
        storm({
          resortId: "alta",
          resortName: "Alta",
          start,
          inches: 30,
          now: "2026-12-01",
        }),
      ],
      [],
      "2026-12-01"
    );
    assert.equal(plan.triggered[0].reason, "new");
    assert.deepEqual(plan.triggered[0].reasons, ["new"]);
  });
});

describe("storm date labels", () => {
  function copyFor(start, end) {
    return buildStormMessages({
      triggered: [
        {
          resortId: "alta",
          resortName: "Alta",
          start: utcDay(start),
          end: utcDay(end),
          peakInches: 18,
          totalInches: 18,
          leadDays: 12,
          reason: "new",
        },
      ],
      monitoring: [],
    });
  }

  it("formats a single day, a same-month range, and a month boundary", () => {
    assert.equal(formatStormDate("2026-12-10", "2026-12-10"), "Dec 10");
    assert.equal(formatStormDate("2026-12-10", "2026-12-11"), "Dec 10-11");
    assert.equal(formatStormDate("2026-11-30", "2026-12-01"), "Nov 30-Dec 1");

    const single = copyFor("2026-12-10", "2026-12-10");
    const sameMonth = copyFor("2026-12-10", "2026-12-11");
    const boundary = copyFor("2026-11-30", "2026-12-01");

    assert.equal(single.sms.includes('Alta 18" Dec 10\n'), true);
    assert.equal(single.email.includes("starts Dec 10 (12 days out)"), true);
    assert.equal(single.pushBody.includes('Alta 18" Dec 10 (12d)'), true);

    assert.equal(sameMonth.sms.includes('Alta 18" Dec 10-11\n'), true);
    assert.equal(sameMonth.email.includes("starts Dec 10-11 (12 days out)"), true);
    assert.equal(sameMonth.pushBody.includes('Alta 18" Dec 10-11 (12d)'), true);

    assert.equal(boundary.sms.includes('Alta 18" Nov 30-Dec 1\n'), true);
    assert.equal(boundary.email.includes("starts Nov 30-Dec 1 (12 days out)"), true);
    assert.equal(boundary.pushBody.includes('Alta 18" Nov 30-Dec 1 (12d)'), true);

    for (const copy of [single, sameMonth, boundary]) {
      assert.equal(isGsm7(copy.sms), true);
      assert.equal(copy.sms.includes("–"), false);
      assert.equal(copy.sms.includes("—"), false);
      assert.equal(copy.email.includes("–"), false);
      assert.equal(copy.pushBody.includes("–"), false);
    }
  });
});

describe("two-section radar copy", () => {
  const single = {
    resortId: "alta",
    resortName: "Alta",
    start: utcDay("2026-12-16"),
    end: utcDay("2026-12-17"),
    peakInches: 18,
    totalInches: 32,
    leadDays: 15,
    reason: "new",
  };
  const breck = {
    resortId: "breck",
    resortName: "Breck",
    start: utcDay("2026-12-16"),
    end: utcDay("2026-12-16"),
    peakInches: 16,
    totalInches: 16,
    leadDays: 14,
    reason: "new",
  };
  const altaWatching = {
    resortId: "alta",
    resortName: "Alta",
    start: utcDay("2026-12-16"),
    end: utcDay("2026-12-16"),
    peakInches: 18,
    totalInches: 18,
    leadDays: 14,
    reason: null,
  };

  it("renders a single storm without a monitoring section or lodging copy", () => {
    const copy = buildStormMessages({ triggered: [single], monitoring: [] });
    const expectedSms = [
      "New PowAlerts!",
      'Alta 18" Dec 16-17',
      "Open -> https://powalert.com/dashboard",
    ].join("\n");
    const expectedEmail = [
      "New PowAlerts!",
      "",
      'Alta: 18" peak, 32" over the storm, starts Dec 16-17 (15 days out). New storm.',
      "",
      "Open -> https://powalert.com/dashboard",
    ].join("\n");
    const expectedPush = [
      "New PowAlerts!",
      'Alta 18" Dec 16-17 (15d)',
      "Open -> https://powalert.com/dashboard",
    ].join("\n");

    console.log("SAMPLE SMS (single storm):\n" + copy.sms);
    console.log("SAMPLE EMAIL (single storm):\n" + copy.email);
    console.log("SAMPLE PUSH (single storm):\n" + copy.pushTitle + "\n" + copy.pushBody);

    assert.equal(copy.sms, expectedSms);
    assert.equal(copy.email, expectedEmail);
    assert.equal(copy.pushTitle, "New PowAlerts!");
    assert.equal(copy.pushBody, expectedPush);
    assert.equal(copy.sms.includes("Other PowAlerts"), false);
    assert.equal(copy.email.includes("Other PowAlerts"), false);
    assert.equal(isGsm7(copy.sms), true);
    for (const channel of [copy.sms, copy.email, copy.pushBody]) {
      for (const snippet of LODGING_SNIPPETS) {
        assert.equal(channel.includes(snippet), false, snippet);
      }
    }
  });

  it("renders Breck as new and Alta as monitoring", () => {
    const copy = buildStormMessages({
      triggered: [breck],
      monitoring: [altaWatching],
    });
    const expectedSms = [
      "New PowAlerts!",
      'Breck 16" Dec 16',
      "Other PowAlerts You're Monitoring",
      'Alta 18" Dec 16',
      "Open -> https://powalert.com/dashboard",
    ].join("\n");
    const expectedEmail = [
      "New PowAlerts!",
      "",
      'Breck: 16" peak, starts Dec 16 (14 days out). New storm.',
      "",
      "Other PowAlerts You're Monitoring",
      "",
      'Alta: 18" peak, starts Dec 16 (14 days out).',
      "",
      "Open -> https://powalert.com/dashboard",
    ].join("\n");
    const expectedPush = [
      "New PowAlerts!",
      'Breck 16" Dec 16 (14d)',
      "Other PowAlerts You're Monitoring",
      'Alta 18" Dec 16 (14d)',
      "Open -> https://powalert.com/dashboard",
    ].join("\n");

    console.log("SAMPLE SMS (multi resort):\n" + copy.sms);
    console.log("SAMPLE EMAIL (multi resort):\n" + copy.email);
    console.log("SAMPLE PUSH (multi resort):\n" + copy.pushTitle + "\n" + copy.pushBody);

    assert.equal(copy.sms, expectedSms);
    assert.equal(copy.email, expectedEmail);
    assert.equal(copy.pushBody, expectedPush);
    assert.equal(isGsm7(copy.sms), true);
    assert.equal((copy.sms.match(/Open -> /g) || []).length, 1);
    for (const channel of [copy.sms, copy.email, copy.pushBody]) {
      for (const snippet of LODGING_SNIPPETS) {
        assert.equal(channel.includes(snippet), false, snippet);
      }
    }
  });
});

describe("storm state storage stays compatible with old notification rows", () => {
  it("still validates a legacy notification that has no storm fields", () => {
    const doc = new Notification({
      userId: new mongoose.Types.ObjectId(),
      resortId: new mongoose.Types.ObjectId(),
      message: "legacy powder alert",
      alertDate: new Date("2026-01-04T00:00:00.000Z"),
    });
    assert.equal(doc.validateSync(), undefined);
  });

  it("stores a storm before it has been shown", () => {
    const doc = new StormAlertState({
      userId: new mongoose.Types.ObjectId(),
      resortId: new mongoose.Types.ObjectId(),
      stormStart: new Date("2026-12-16T00:00:00.000Z"),
      stormEnd: new Date("2026-12-17T00:00:00.000Z"),
      peakInches: 18,
      totalInches: 32,
      leadDays: 15,
    });
    assert.equal(doc.validateSync(), undefined);
    assert.equal(doc.lastShownAt, undefined);
  });

  it("does not build lodging lines in the alert service", () => {
    const source = readFileSync(join(root, "../services/weatherAlertService.js"), "utf8");
    assert.match(source, /planMorningAlert/);
    assert.match(source, /buildStormMessages/);
    assert.doesNotMatch(source, /Book Now/);
    assert.doesNotMatch(source, /No lodging links available/);
    assert.doesNotMatch(source, /🏨/);
    assert.match(source, /isPowderAlertCronEnabled/);
  });
});
