const SUBTITLE_REGEX = /(subtitle|caption|subtitles|\.vtt(\?|$)|\.srt(\?|$)|\.ass(\?|$)|\.ttml(\?|$))/i;
const HLS_PLAYLIST_REGEX = /\.m3u8(\?|$)/i;

function safeHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function vttToSrt(vtt) {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const out = [];
  let index = 1;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line === "WEBVTT" || line.startsWith("NOTE") || line.startsWith("STYLE")) {
      i += 1;
      continue;
    }

    if (line.includes("-->") || (i + 1 < lines.length && lines[i + 1].includes("-->"))) {
      const timingLine = line.includes("-->") ? line : lines[++i].trim();
      const textLines = [];
      i += 1;
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i]);
        i += 1;
      }
      out.push(String(index++));
      out.push(normalizeTiming(timingLine));
      out.push(textLines.join("\n"));
      out.push("");
      continue;
    }

    i += 1;
  }

  return out.join("\n");
}

function normalizeTiming(timingLine) {
  return timingLine
    .replace(/\./g, ",")
    .replace(/\s+/g, " ")
    .replace(/(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3}).*/, "$1 --> $2");
}

function looksLikeVttPayload(text) {
  const head = text.slice(0, 2048);
  return /(^|\n)WEBVTT(\n|$)/i.test(head) || /\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(head);
}

function inferFormat(url, contentType) {
  const lower = `${url} ${contentType || ""}`.toLowerCase();
  if (lower.includes(".srt") || lower.includes("subrip")) return "srt";
  if (lower.includes(".ass")) return "ass";
  if (lower.includes("ttml") || lower.includes(".xml")) return "ttml";
  if (lower.includes(".vtt") || lower.includes("text/vtt")) return "vtt";
  return "unknown";
}

function looksLikeSubtitle(url, contentType) {
  if (HLS_PLAYLIST_REGEX.test(url)) return false;
  if (/_thumbs\.vtt(\?|$)/i.test(url)) return false;
  if (/\/thumb\//i.test(url) && /application\/octet-stream/i.test(contentType)) return false;
  if (SUBTITLE_REGEX.test(url)) return true;
  if (!contentType) return false;
  if (/mpegurl|application\/vnd\.apple\.mpegurl/i.test(contentType)) return false;
  return /(text\/vtt|application\/x-subrip|subrip|ttml|caption|subtitle)/i.test(contentType);
}

function subtitleCandidateScore(candidate) {
  const url = String(candidate?.url || "").toLowerCase();
  const host = safeHostname(url);
  const fmt = String(candidate?.format || "unknown").toLowerCase();
  let score = 0;
  if (fmt === "vtt") score += 30;
  else if (fmt === "srt") score += 20;
  else if (fmt !== "unknown") score += 10;
  if (url.includes("vi") || url.includes("vietnam")) score += 8;
  if (url.includes("caption") || url.includes("subtitle")) score += 4;
  if (host === "vodcdn.fptplay.net" || host.endsWith(".vodcdn.fptplay.net")) score += 8;
  if (host === "vod.fptplay53.net") score += 8;
  if (url.includes("/subtitles/vi/")) score += 10;
  if (url.includes(".vie.vtt") || (url.includes(".vie.") && url.includes(".vtt"))) score += 12;
  return score;
}

if (typeof module !== "undefined") {
  module.exports = { vttToSrt, normalizeTiming, looksLikeVttPayload, inferFormat, looksLikeSubtitle, subtitleCandidateScore, safeHostname };
}
