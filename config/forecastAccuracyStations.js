// Single editable station map for the 2026-27 accuracy tracker.
// Swap a SNOTEL/SCAN triplet here. Nothing else hard-codes station ids.
//
// Forecast lat/lon is the resort point sent to Open-Meteo, NWS, Visual Crossing,
// and CPC. Truth is the NRCS station, which is not always on the hill.
// Vail, Steamboat, and Mount Baker coordinates match data/resorts.json.
// The other five resorts are not in that file, so their points live here.
//
// Backup triplets are recorded from the 2026-10-16 AWDB check. Only Mount Baker
// auto-falls back (fallbackOnSparseSnwd). Set that flag, or replace `primary`,
// when CoS wants a different station to win.

import { DEFAULT_SETTLING_TOLERANCE_IN, DEFAULT_SNWD_COVERAGE_MIN_PCT } from "../services/forecastAccuracy/constants.js";

export const ACCURACY_RESORTS = [
  {
    resort: "Park City",
    state: "UT",
    latitude: 40.6514,
    longitude: -111.5079,
    timezone: "America/Denver",
    settlingToleranceIn: DEFAULT_SETTLING_TOLERANCE_IN,
    snwdCoverageMinPct: DEFAULT_SNWD_COVERAGE_MIN_PCT,
    qualityFlag: null,
    fallbackOnSparseSnwd: false,
    primary: {
      triplet: "814:UT:SNTL",
      name: "Thaynes Canyon",
      elevFt: 9260,
      distMi: 2.3,
    },
    backup: null,
    notes: "Hourly SNWD, WTEQ, TOBS, PREC.",
  },
  {
    resort: "Alta",
    state: "UT",
    latitude: 40.5884,
    longitude: -111.6386,
    timezone: "America/Denver",
    settlingToleranceIn: DEFAULT_SETTLING_TOLERANCE_IN,
    snwdCoverageMinPct: DEFAULT_SNWD_COVERAGE_MIN_PCT,
    qualityFlag: null,
    fallbackOnSparseSnwd: false,
    primary: {
      triplet: "1308:UT:SNTL",
      name: "Atwater",
      elevFt: 8750,
      distMi: 0.2,
    },
    backup: {
      triplet: "766:UT:SNTL",
      name: "Snowbird",
      elevFt: 9170,
      distMi: 1.7,
    },
    notes: "Backup is on file only. Flip fallbackOnSparseSnwd or replace primary to use it.",
  },
  {
    resort: "Jackson Hole",
    state: "WY",
    latitude: 43.5875,
    longitude: -110.8279,
    timezone: "America/Denver",
    settlingToleranceIn: DEFAULT_SETTLING_TOLERANCE_IN,
    snwdCoverageMinPct: DEFAULT_SNWD_COVERAGE_MIN_PCT,
    qualityFlag: null,
    fallbackOnSparseSnwd: false,
    primary: {
      triplet: "689:WY:SNTL",
      name: "Phillips Bench",
      elevFt: 8170,
      distMi: 6.5,
    },
    backup: {
      triplet: "1082:WY:SNTL",
      name: "Grand Targhee",
      elevFt: null,
      distMi: 14.2,
    },
    notes: "Backup is on file only.",
  },
  {
    resort: "Vail",
    state: "CO",
    latitude: 39.6403,
    longitude: -106.3742,
    timezone: "America/Denver",
    settlingToleranceIn: DEFAULT_SETTLING_TOLERANCE_IN,
    snwdCoverageMinPct: DEFAULT_SNWD_COVERAGE_MIN_PCT,
    qualityFlag: null,
    fallbackOnSparseSnwd: false,
    primary: {
      triplet: "842:CO:SNTL",
      name: "Vail Mountain",
      elevFt: 10290,
      distMi: 1.6,
    },
    backup: null,
    notes: "Hourly SNWD, WTEQ, TOBS, PREC.",
  },
  {
    resort: "Mammoth",
    state: "CA",
    latitude: 37.6308,
    longitude: -119.0326,
    timezone: "America/Los_Angeles",
    settlingToleranceIn: DEFAULT_SETTLING_TOLERANCE_IN,
    snwdCoverageMinPct: DEFAULT_SNWD_COVERAGE_MIN_PCT,
    qualityFlag: "distant",
    fallbackOnSparseSnwd: false,
    primary: {
      triplet: "846:CA:SNTL",
      name: "Virginia Lakes Ridge",
      elevFt: 9400,
      distMi: 32.5,
    },
    backup: null,
    notes:
      "Nearest NRCS SNTL with hourly SNWD is 32.5 mi away. MHP:CA:MSNT is daily WTEQ only. Quality is distant until this triplet is swapped.",
  },
  {
    resort: "Steamboat",
    state: "CO",
    latitude: 40.485,
    longitude: -106.8317,
    timezone: "America/Denver",
    settlingToleranceIn: DEFAULT_SETTLING_TOLERANCE_IN,
    snwdCoverageMinPct: DEFAULT_SNWD_COVERAGE_MIN_PCT,
    qualityFlag: null,
    fallbackOnSparseSnwd: false,
    primary: {
      triplet: "457:CO:SNTL",
      name: "Dry Lake",
      elevFt: 8240,
      distMi: 5.4,
    },
    backup: {
      triplet: "825:CO:SNTL",
      name: "Tower",
      elevFt: 10610,
      distMi: 8.7,
    },
    notes: "Backup is on file only.",
  },
  {
    resort: "Stowe",
    state: "VT",
    latitude: 44.5303,
    longitude: -72.7814,
    timezone: "America/New_York",
    settlingToleranceIn: DEFAULT_SETTLING_TOLERANCE_IN,
    snwdCoverageMinPct: DEFAULT_SNWD_COVERAGE_MIN_PCT,
    qualityFlag: "snwd_derived",
    fallbackOnSparseSnwd: false,
    primary: {
      triplet: "2041:VT:SCAN",
      name: "Mount Mansfield (SCAN)",
      elevFt: 2310,
      distMi: 2.6,
    },
    backup: null,
    notes:
      "No Vermont SNTL. SCAN has hourly SNWD and TOBS, no WTEQ, and PREC only about daily. New snow is positive SNWD change with settling tolerance. Quality is snwd_derived. Elevation is well below the summit.",
  },
  {
    resort: "Mount Baker",
    state: "WA",
    latitude: 48.8588,
    longitude: -121.6827,
    timezone: "America/Los_Angeles",
    settlingToleranceIn: DEFAULT_SETTLING_TOLERANCE_IN,
    snwdCoverageMinPct: DEFAULT_SNWD_COVERAGE_MIN_PCT,
    qualityFlag: null,
    fallbackOnSparseSnwd: true,
    primary: {
      triplet: "909:WA:SNTL",
      name: "Wells Creek",
      elevFt: 4040,
      distMi: 5.7,
    },
    backup: {
      triplet: "1011:WA:SNTL",
      name: "MF Nooksack",
      elevFt: 4940,
      distMi: 12.3,
    },
    notes:
      "Primary SNWD is sparse. When primary coverage is under snwdCoverageMinPct and the backup has better SNWD coverage, the day uses 1011:WA:SNTL and quality sparse_fallback.",
  },
];

export function resortByName(name) {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  return (
    ACCURACY_RESORTS.find((resort) => resort.resort.toLowerCase() === needle) || null
  );
}

export function selectResorts(name) {
  if (!name) return ACCURACY_RESORTS;
  const resort = resortByName(name);
  if (!resort) {
    const known = ACCURACY_RESORTS.map((item) => item.resort).join(", ");
    throw new Error(`Unknown accuracy resort "${name}". Known: ${known}`);
  }
  return [resort];
}
