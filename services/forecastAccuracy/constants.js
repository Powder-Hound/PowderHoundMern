// Shared knobs for the 2026-27 forecast-accuracy tracker.
// Alert thresholds and the powder-alert cron are unrelated and live elsewhere.

export const FORECAST_ACCURACY_SEASON = "2026-27";

// Calendar days stored from a model run. Lead 0 is the run's local calendar
// day and is kept for audit, but scoring buckets start at lead 1.
export const FORECAST_HORIZON_DAYS = 16;

export const STORM_THRESHOLD_IN = 6;

export const LEAD_BUCKETS = [
  { id: "1-3", min: 1, max: 3 },
  { id: "4-7", min: 4, max: 7 },
  { id: "8-16", min: 8, max: 16 },
];

// Hourly SNWD often jitters by a couple tenths, and some sensors step by
// a whole inch and then fall back. New snow is only the rise that sets a
// new peak, and only once that rise clears this tolerance. A drop does not
// remove snow already counted. A rebound that stays at or below the peak
// is settling, not another storm.
export const DEFAULT_SETTLING_TOLERANCE_IN = 0.3;

// If the coldest hourly TOBS is still at least this warm, SNWD upticks are
// treated as sensor chatter. The raw peak increase is kept on snwdIncreaseIn.
export const WARM_SNWD_MIN_F = 35;

// Mount Baker primary SNWD is sparse. Fall back when coverage is under this.
export const DEFAULT_SNWD_COVERAGE_MIN_PCT = 50;

export const EXPECTED_HOURLY_SAMPLES = 24;

// Below this, a day that still has some SNWD is flagged partial.
export const PARTIAL_COVERAGE_PCT = 80;

export const AWDB_DATA_URL =
  "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data";

export const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export const NWS_POINTS_URL = "https://api.weather.gov/points";

// NOAA MapServer: CPC 8-14 day temp (layer 0) and precip (layer 1) polygons.
// Verified 2026-10-17. Attributes include cat (Above/Below/Normal), prob,
// fcst_date, start_date, end_date. Point query with inSR=4326.
export const CPC_814_MAPSERVER =
  "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/cpc_8_14_day_outlk/MapServer";

export const VISUAL_CROSSING_TIMELINE_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";

export const USER_AGENT =
  "PowAlert-forecast-accuracy/1.0 (accuracy-tracker; forecast-accuracy@powalert.local)";
