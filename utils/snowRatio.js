/**
 * Snow from liquid precipitation using the Kuchera snow-to-liquid ratio.
 *
 * Coefficients, from Rosenow, Reeves, and Tripp (2023, Wea. Forecasting,
 * 38, 1803–1819, doi:10.1175/WAF-D-22-0202.1) and the NWS forecast guide
 * "NWP Snow Accumulation Products". Both reproduce Kuchera's unpublished
 * 2004 development file (E. Kuchera 2021, personal communication, as cited
 * by Rosenow et al.):
 *
 *   Tmax > 271.16 K:  SLR = 12 + 2 * (271.16 - Tmax)
 *   Tmax <= 271.16 K: SLR = 12 + (271.16 - Tmax)
 *
 * Tmax in that method is the warmest temperature in the lowest 500 hPa.
 * This grid has a surface temperature, not a profile, so the same
 * coefficients are applied to the surface temperature, or to the wet-bulb
 * temperature when the caller has one. A warm nose above the surface is
 * not visible here and will be mis-ratioed.
 *
 * The temperature dependence itself is the result in Roebber et al. (2003,
 * Wea. Forecasting, 18, 264–287): snow habit, and therefore SLR, follows
 * temperature. They classify snow as heavy (SLR < 9), average (9–15), or
 * light (> 15). They do not publish a single polynomial, so those class
 * bounds are not used as coefficients.
 *
 * Alcott and Steenburgh (2010, Wea. Forecasting, 25, 323–337) measured the
 * same dependence at Alta, Utah: SLR falls as surface and 650 hPa
 * temperature rise, and their stepwise regression needs wind and humidity
 * through the column. Those predictors are not in the NWS grid response,
 * so their regression coefficients are not copied. They also show the NWS
 * 1996 meltwater table (10:1 at 28–34°F, 30:1 at 10–14°F) runs high at
 * Alta. This function uses Kuchera instead of that table. At 32°F the
 * Kuchera ratio is 8:1, and at 14°F it is 20:1.
 *
 * Rain/snow cutoff: 32°F (0°C). At or below the cutoff the ratio is
 * applied. Above it the liquid is treated as rain and the snow is 0.
 * When wetBulb is passed it is the decision temperature, both for the
 * cutoff and for the ratio, because the wet-bulb temperature is the
 * temperature of a precipitating hydrometeor when a sounding is unavailable.
 */

export const KUCHERA_BREAK_K = 271.16;
export const RAIN_SNOW_CUTOFF_F = 32;
export const POWALERT_SLR_SOURCE = "powalert-slr";

export function fahrenheitToKelvin(tempF) {
  return ((tempF - 32) * 5) / 9 + 273.15;
}

/** Kuchera SLR (dimensionless inches of snow per inch of liquid). */
export function kucheraSlr(tempF) {
  const tempK = fahrenheitToKelvin(tempF);
  if (tempK > KUCHERA_BREAK_K) return 12 + 2 * (KUCHERA_BREAK_K - tempK);
  return 12 + (KUCHERA_BREAK_K - tempK);
}

/**
 * Inches of snow from inches of liquid.
 * Returns null when qpf or the temperature cannot be read.
 * Returns 0 when the decision temperature is above 32°F.
 *
 * @param {number} qpfIn liquid inches
 * @param {number} tempF dry-bulb Fahrenheit
 * @param {number} [wetBulb] wet-bulb Fahrenheit; used instead of tempF when finite
 */
export function snowFromLiquid(qpfIn, tempF, wetBulb) {
  const qpf = Number(qpfIn);
  const temp = Number(tempF);
  if (!Number.isFinite(qpf) || qpf < 0 || !Number.isFinite(temp)) return null;
  const hasWetBulb = wetBulb != null && wetBulb !== "";
  const decision = hasWetBulb ? Number(wetBulb) : temp;
  if (!Number.isFinite(decision)) return null;
  if (decision > RAIN_SNOW_CUTOFF_F) return 0;
  const slr = kucheraSlr(decision);
  if (!(slr > 0)) return 0;
  return qpf * slr;
}
