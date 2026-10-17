import { readFile } from "node:fs/promises";
import { renderLeaderboardSvg } from "../services/forecastAccuracy/chart.js";
import { scoreForecasts } from "../services/forecastAccuracy/score.js";
import { parseArgs } from "./accuracyArgs.js";
import { writeJson, writeText } from "./accuracyIo.js";

const help = `Usage: npm run accuracy:score -- [--forecast file] [--observations file] [--out dir]

Scores stored forecast rows against daily SNOTEL observations.
Reads output/accuracy/forecast_snapshots.json and observations.json by default.
Writes scorecard.json, leaderboard.svg, and headline.txt. No network. No Mongo.`;

async function readRows(path) {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error(`${path} is not a JSON array`);
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`${path} is missing. Scoring with zero rows.`);
      return [];
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help);
    return;
  }
  const forecastPath = args.forecast || `${args.outDir}/forecast_snapshots.json`;
  const observationPath = args.observations || `${args.outDir}/observations.json`;
  const snapshots = await readRows(forecastPath);
  const observations = await readRows(observationPath);
  const scorecard = scoreForecasts(snapshots, observations);
  const svg = renderLeaderboardSvg(scorecard);
  const scorePath = await writeJson(args.outDir, "scorecard.json", scorecard);
  const svgPath = await writeText(args.outDir, "leaderboard.svg", svg);
  const headlinePath = await writeText(args.outDir, "headline.txt", `${scorecard.headline}\n`);
  console.log(scorecard.headline);
  console.log(
    JSON.stringify(
      {
        pairCount: scorecard.pairCount,
        skipped: scorecard.skipped,
        scorecard: scorePath,
        chart: svgPath,
        headline: headlinePath,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
