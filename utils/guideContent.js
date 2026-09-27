import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Allowlist for POST /api/leads `guide`. */
export const LEAD_GUIDE_SLUGS = ["ski-vanlife", "adult-ski-camps"];

/**
 * Editorial filenames are what gets emailed. The slug filename is only a fallback
 * if that file is the one present.
 */
export const GUIDE_CONTENT_FILES = {
  "ski-vanlife": ["ski-vanlife-guide.md", "ski-vanlife.md"],
  "adult-ski-camps": ["adult-ski-camps-2026-27.md", "adult-ski-camps.md"],
};

export const GUIDE_SUBJECTS = {
  "ski-vanlife": "Your PowAlert ski vanlife guide",
  "adult-ski-camps": "Your PowAlert adult ski camps guide",
};

const guidesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "content",
  "guides"
);

export function pickGuideFilename(slug, existingNames) {
  const candidates = GUIDE_CONTENT_FILES[slug] || [];
  const present = new Set(existingNames);
  return candidates.find((name) => present.has(name)) || null;
}

export function loadGuideMarkdown(slug, dir = guidesDir) {
  const candidates = GUIDE_CONTENT_FILES[slug];
  if (!candidates) {
    throw new Error(`unknown guide ${slug}`);
  }
  for (const name of candidates) {
    const path = join(dir, name);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  throw new Error(`missing guide markdown for ${slug}`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(raw) {
  let html = escapeHtml(raw);
  html = html.replace(
    /\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g,
    (_match, text, href) => {
      const url = href.startsWith("/") ? `https://powalert.com${href}` : href;
      return `<a href="${url}" style="color:#0b3a5b;">${text}</a>`;
    }
  );
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return html;
}

const TABLE_CELL =
  "border:1px solid #c5d0d6;padding:8px 6px;vertical-align:top;text-align:left;";

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function isTableBlock(lines) {
  return lines.length >= 2 && lines.every((line) => /^\s*\|.+\|\s*$/.test(line));
}

function renderTable(lines) {
  const rows = lines.map(splitTableRow);
  let header = null;
  let body = rows;
  if (rows.length >= 2 && isSeparatorRow(rows[1])) {
    header = rows[0];
    body = rows.slice(2);
  }
  const head = header
    ? `<thead><tr>${header
        .map(
          (cell) =>
            `<th align="left" bgcolor="#0b3a5b" style="${TABLE_CELL}background:#0b3a5b;color:#ffffff;font-weight:700;">${formatInline(cell)}</th>`
        )
        .join("")}</tr></thead>`
    : "";
  const bodyHtml = body
    .map((row, index) => {
      const bg = index % 2 === 0 ? "#ffffff" : "#f4f7f8";
      const cells = row
        .map(
          (cell) =>
            `<td bgcolor="${bg}" style="${TABLE_CELL}background:${bg};">${formatInline(cell)}</td>`
        )
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:12px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.35;color:#1c2830;">${head}<tbody>${bodyHtml}</tbody></table>`;
}

function renderBlock(block) {
  if (block.startsWith("```")) {
    const inner = block.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
    return `<pre>${escapeHtml(inner)}</pre>`;
  }
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(block)) {
    return `<hr style="border:0;border-top:1px solid #d5dee3;margin:20px 0;">`;
  }

  const lines = block.split("\n");
  if (isTableBlock(lines)) return renderTable(lines);
  const heading = lines.length === 1 ? lines[0].match(/^(#{1,3})\s+(.+)$/) : null;
  if (heading) {
    const level = heading[1].length;
    return `<h${level}>${formatInline(heading[2].trim())}</h${level}>`;
  }
  if (lines.every((line) => /^>\s?/.test(line))) {
    const inner = lines.map((line) => line.replace(/^>\s?/, "")).join(" ");
    return `<blockquote>${formatInline(inner)}</blockquote>`;
  }
  if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
    const items = lines
      .map((line) => {
        const indent = line.match(/^\s*/)[0].length;
        const pad = indent >= 2 ? "padding-left:16px;" : "";
        return `<li style="margin:0 0 6px;${pad}">${formatInline(line.replace(/^\s*[-*]\s+/, ""))}</li>`;
      })
      .join("");
    return `<ul style="margin:0 0 12px;padding-left:20px;">${items}</ul>`;
  }
  if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
    const items = lines
      .map(
        (line) =>
          `<li style="margin:0 0 6px;">${formatInline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`
      )
      .join("");
    return `<ol style="margin:0 0 12px;padding-left:20px;">${items}</ol>`;
  }
  return `<p>${lines.map((line) => formatInline(line)).join("<br>")}</p>`;
}

/** Headings, paragraphs, lists, quotes, fences, rules, tables, bold, italic, links. HTML is escaped. */
export function renderGuideMarkdown(markdown) {
  const text = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((block) => renderBlock(block.trim()))
    .filter(Boolean)
    .join("\n");
}

export function guideCtaUrl(guide, utm = {}) {
  const url = new URL("https://powalert.com/go");
  url.searchParams.set("from", guide);
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ]) {
    const value = String(utm[key] ?? "").trim();
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function wrapGuideEmailHtml({ bodyHtml, ctaUrl, name }) {
  const safeUrl = escapeHtml(ctaUrl);
  const greeting = name ? `<p>Hi ${escapeHtml(name)},</p>` : "";
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f4f7f8;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;padding:28px;font-family:Georgia,'Times New Roman',serif;color:#1c2830;line-height:1.5;">
    <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0b3a5b;">PowAlert</p>
    ${greeting}
    ${bodyHtml}
    <p style="margin:28px 0 8px;">
      <a href="${safeUrl}" style="display:inline-block;background:#0b3a5b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-family:Arial,sans-serif;font-weight:700;">See PowAlert</a>
    </p>
    <p style="font-family:Arial,sans-serif;font-size:13px;color:#5c6b73;">Or open <a href="${safeUrl}">${safeUrl}</a></p>
  </div>
</body>
</html>`;
}

export function buildGuideEmail({ guide, markdown, name = "", utm = {} }) {
  const ctaUrl = guideCtaUrl(guide, utm);
  const bodyHtml = renderGuideMarkdown(markdown);
  const html = wrapGuideEmailHtml({ bodyHtml, ctaUrl, name });
  const greeting = name ? `Hi ${name},\n\n` : "";
  const text = `${greeting}${String(markdown || "").trim()}\n\nSee PowAlert: ${ctaUrl}\n`;
  return {
    subject: GUIDE_SUBJECTS[guide] || "Your PowAlert guide",
    text,
    html,
    ctaUrl,
  };
}
