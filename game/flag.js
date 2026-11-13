/** Resort game stays off unless ENABLE_RESORT_GAME is exactly the string "true". */

export const RESORT_GAME_ENV = "ENABLE_RESORT_GAME";

export function isResortGameEnabled(env = globalThis.process.env) {
  return env[RESORT_GAME_ENV] === "true";
}
