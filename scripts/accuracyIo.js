import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function writeJson(dir, name, value) {
  const path = join(dir, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

export async function writeText(dir, name, value) {
  const path = join(dir, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
  return path;
}

export function sampleRows(rows, { perSource = true } = {}) {
  const seen = new Set();
  const samples = [];
  for (const row of rows) {
    const key = perSource ? row.source || row.quality : `${row.resort}|${row.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const clone = { ...row };
    if (Array.isArray(clone.hourly)) {
      clone.hourly = clone.hourly.slice(0, 2);
      clone.hourlyTruncated = true;
    }
    samples.push(clone);
  }
  return samples;
}

export function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = row[field] || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
