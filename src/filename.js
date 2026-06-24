function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
}

function dotCaseTitle(name) {
  return String(name || "video")
    .replace(/[^\p{L}\p{N}]+/gu, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function normalizeSeriesRawTitle(title) {
  const raw = (title || "video").trim();
  const cleaned = raw
    .replace(/\s*\(\s*(tập|tap|episode|ep)\s*\d+\s*\)$/i, "")
    .replace(/\s*[-|:]?\s*(tập|tap|episode|ep)\s*\d+.*$/i, "")
    .trim();
  return cleaned || raw || "video";
}

function subtitleSourceLabel(context) {
  const provider = String(context?.provider || "").toLowerCase();
  if (provider === "tv360") return "TV360";
  if (provider === "fptplay") return "FPTPLAY";
  return "UNKNOWN";
}

function parseEpisodeFromTapSlug(url) {
  const m = (url || "").match(/-tap-(\d{1,3})(?:[-/?]|$)/i);
  return m ? Number(m[1]) : NaN;
}

function parseEpisodeFromTapText(text) {
  const m = (text || "").match(/(?:tập|tap)\s*(\d{1,3})/i);
  return m ? Number(m[1]) : NaN;
}

function inferEpisodeNumber(ep, fallback) {
  const text = `${ep?.episodeLabel || ""} ${ep?.title || ""} ${ep?.url || ""}`;
  const m = text.match(/(?:tập|tap|episode|ep)\s*[_-]?(\d{1,3})/i) || text.match(/-tap-(\d{1,3})(?:[-/?]|$)/i);
  if (m) return Number(m[1]);
  return Number(fallback);
}

function extractTv360EpisodeNumber(ep, context) {
  const provider = (context?.provider || "").toLowerCase();
  if (provider !== "tv360") return NaN;

  const fromUrl = parseEpisodeFromTapSlug(ep?.url || context?.currentUrl || "");
  if (Number.isFinite(fromUrl)) return fromUrl;

  const fromLabel = parseEpisodeFromTapText(ep?.episodeLabel || ep?.title || context?.episodeTitle || "");
  if (Number.isFinite(fromLabel)) return fromLabel;

  return NaN;
}

function detectSeasonEpisode(ep, context, episodeNumberOverride) {
  const provider = (context?.provider || "").toLowerCase();
  const text = `${ep?.title || ""} ${context?.episodeTitle || ""} ${ep?.url || ""} ${context?.currentUrl || ""} ${context?.title || ""}`;

  const seasonMatch = text.match(/(?:season|phần|phan|s)\s*[_-]?(\d{1,2})/i);
  const episodeMatch = text.match(/(?:episode|ep|tập|tap)\s*[_-]?(\d{1,3})/i);

  let season = seasonMatch ? Number(seasonMatch[1]) : Number(context?.season);
  let episode = episodeMatch ? Number(episodeMatch[1]) : Number(context?.currentEpisodeNumber);

  // For TV360 full-season crawl, trust crawl order as source of truth.
  if (provider === "tv360" && Number.isFinite(episodeNumberOverride)) {
    episode = Number(episodeNumberOverride);
  }

  if (!Number.isFinite(episode)) {
    episode = extractTv360EpisodeNumber(ep, context);
  }

  if (!Number.isFinite(episode) && Number.isFinite(episodeNumberOverride)) {
    episode = Number(episodeNumberOverride);
  }

  if (!Number.isFinite(episode) && provider !== "tv360") {
    const trailingNumber = (ep?.title || context?.episodeTitle || "").match(/(?:^|\s|-)(\d{1,3})(?:$|\s)/);
    if (trailingNumber) episode = Number(trailingNumber[1]);
  }

  if (!Number.isFinite(episode)) episode = 1;
  if (!Number.isFinite(season) || season < 1) season = 1;
  if (episode < 1) episode = 1;

  return { season, episode };
}

if (typeof module !== "undefined") {
  module.exports = { safeFileName, dotCaseTitle, normalizeSeriesRawTitle, subtitleSourceLabel, detectSeasonEpisode, inferEpisodeNumber, parseEpisodeFromTapSlug, parseEpisodeFromTapText };
}
