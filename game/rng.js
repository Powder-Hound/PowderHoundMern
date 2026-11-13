/**
 * Mulberry32, Tommy Ettinger. The hex constants are the published algorithm,
 * not economic parameters. State is a uint32 so a game can persist it.
 */

const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_MIX_1 = 15;
const MULBERRY_MIX_2 = 7;
const MULBERRY_MIX_3 = 14;
const MULBERRY_MUL_2 = 61;
const UNIT_INTERVAL = 4294967296;
export const UINT32_MAX = UNIT_INTERVAL - 1;

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function hashSeed(text) {
  let hash = FNV_OFFSET;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function nextRng(state) {
  let a = state.rngState >>> 0;
  a = (a + MULBERRY_INCREMENT) | 0;
  let t = Math.imul(a ^ (a >>> MULBERRY_MIX_1), 1 | a);
  t = (t + Math.imul(t ^ (t >>> MULBERRY_MIX_2), MULBERRY_MUL_2 | t)) ^ t;
  const unit = ((t ^ (t >>> MULBERRY_MIX_3)) >>> 0) / UNIT_INTERVAL;
  state.rngState = a >>> 0;
  return unit;
}
