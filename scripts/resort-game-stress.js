import { CAVEAT, usedCatalog } from "../game/economics.config.js";
import { runStress, scenarioLine } from "../game/stress.js";

const report = runStress();
console.log(CAVEAT);
console.log("");
console.log("Reference resort");
console.log(JSON.stringify(report.profile, null, 2));
console.log("");
for (const scenario of report.scenarios) console.log(scenarioLine(scenario));
console.log("");
console.log(`Sweep cells ${report.sweep.cells}, sanity problems ${report.sweep.problems}, dominant ${report.sweep.dominant ?? "none"}`);
console.log(JSON.stringify(report.sweep.bestByScenario, null, 2));
console.log("");
if (report.clampsObserved.length) {
  console.log("Clamps");
  for (const row of report.clampsObserved) console.log(`- ${row.id}: ${row.clamp}`);
  console.log("");
}
console.log("Constants used in the day equation");
console.log("| id | value | status | year | confidence | source |");
console.log("|---|---|---|---|---|---|");
for (const row of usedCatalog()) {
  const value = typeof row.value === "number"
    ? String(Math.round(row.value * 10000) / 10000)
    : JSON.stringify(row.value);
  const source = row.url || row.placeholder_range || row.status;
  console.log(`| ${row.id} | ${value.replaceAll("|", "/")} | ${row.status} | ${row.year ?? ""} | ${row.confidence ?? ""} | ${String(source).replaceAll("|", "/")} |`);
}
if (report.failed.length) {
  console.error("FAILED", JSON.stringify(report.failed, null, 2));
  globalThis.process.exit(1);
}
