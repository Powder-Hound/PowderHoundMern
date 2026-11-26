import { LEAD_BUCKETS } from "./constants.js";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Self-contained SVG so the scorecard does not need a chart library.
export function renderLeaderboardSvg(scorecard) {
  const width = 1100;
  const rowH = 26;
  const panels = LEAD_BUCKETS.map((bucket) => {
    const models = scorecard.buckets[bucket.id]?.models || [];
    const height = 44 + Math.max(models.length, 1) * rowH + 12;
    return { id: bucket.id, models, height };
  });
  const headerH = 72;
  const height = headerH + panels.reduce((sum, panel) => sum + panel.height + 16, 10);
  const maxMae = Math.max(
    0.5,
    ...panels.flatMap((panel) => panel.models.map((model) => model.mae || 0))
  );
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<rect width="100%" height="100%" fill="#f7f4ef"/>`);
  parts.push(
    `<text x="28" y="34" font-family="Georgia, serif" font-size="22" fill="#1c1917">PowAlert ${escapeXml(scorecard.season)} model accuracy</text>`
  );
  parts.push(
    `<text x="28" y="56" font-family="ui-sans-serif, sans-serif" font-size="13" fill="#44403c">MAE of daily snowfall (inches). Lower bar is better. Storm hit threshold ${escapeXml(scorecard.stormThresholdIn)} in.</text>`
  );

  let y = headerH;
  for (const panel of panels) {
    parts.push(
      `<text x="28" y="${y + 18}" font-family="ui-sans-serif, sans-serif" font-size="16" font-weight="700" fill="#1c1917">Lead ${escapeXml(panel.id)} days</text>`
    );
    let rowY = y + 36;
    if (!panel.models.length) {
      parts.push(
        `<text x="40" y="${rowY + 14}" font-family="ui-sans-serif, sans-serif" font-size="13" fill="#78716c">No overlapping pairs</text>`
      );
    }
    for (const model of panel.models) {
      const barW = Math.max(2, Math.round((model.mae / maxMae) * 520));
      const label = `${model.rank}. ${model.model}`;
      const detail = `MAE ${model.mae.toFixed(2)}  bias ${model.bias.toFixed(2)}  n=${model.n}  hits ${model.hits}  miss ${model.misses}  FA ${model.falseAlarms}`;
      parts.push(`<rect x="210" y="${rowY}" width="${barW}" height="16" rx="2" fill="#1d4e89"/>`);
      parts.push(
        `<text x="28" y="${rowY + 13}" font-family="ui-sans-serif, sans-serif" font-size="12" fill="#1c1917">${escapeXml(label)}</text>`
      );
      parts.push(
        `<text x="${220 + barW}" y="${rowY + 13}" font-family="ui-sans-serif, sans-serif" font-size="12" fill="#44403c">${escapeXml(detail)}</text>`
      );
      rowY += rowH;
    }
    y += panel.height + 16;
  }
  parts.push(`</svg>`);
  return `${parts.join("\n")}\n`;
}
