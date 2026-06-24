function parseTv360SeriesTitle(rawTitle) {
  const text = String(rawTitle || "unknown").trim();
  const withoutEpisode = text
    .replace(/\s*[-|:]?\s*(tập|tap|episode|ep)\s*\d+.*$/i, "")
    .trim();
  const parts = withoutEpisode.split(" - ").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const englishLike = parts.find((p) => isLikelyEnglishTitle(p));
    return englishLike || parts[0];
  }
  return withoutEpisode || parts[0] || text || "unknown";
}

function isLikelyEnglishTitle(text) {
  const s = String(text || "").trim();
  if (!/[a-z]/i.test(s)) return false;
  if (/[\u00C0-\u024F\u1E00-\u1EFF]/.test(s)) return false;
  return true;
}

function isTv360EpisodeByParams(href) {
  try {
    const u = new URL(href, window.location.origin);
    if (!/tv360\.vn$/i.test(u.hostname) && !/\.tv360\.vn$/i.test(u.hostname)) return false;
    return u.pathname.startsWith("/movie/") && u.searchParams.has("m") && u.searchParams.has("e");
  } catch {
    return false;
  }
}

function isLikelyTv360EpisodeLink(anchor) {
  const text = (anchor.textContent || "").trim();
  const href = anchor.href || "";

  if (/tv360\.vn\/movie\//i.test(href)) {
    try {
      const u = new URL(href);
      if (u.searchParams.has("e") || u.searchParams.has("m")) return true;
    } catch {
      return false;
    }
  }

  return /episode|tap-|\/xem\//i.test(href) || /ep|tập/i.test(text);
}

function extractTv360Context() {
  const rawTitle =
    document.querySelector("h1")?.textContent?.trim() ||
    document.querySelector(".movie-name, .film-name")?.textContent?.trim() ||
    document.title ||
    "unknown";
  const title = parseTv360SeriesTitle(rawTitle);

  const episodeTitle =
    document.querySelector(".episode-active, .active .episode-title")?.textContent?.trim() ||
    "";
  const currentEpisodeNumber = extractTv360CurrentEpisodeNumber(rawTitle, episodeTitle, window.location.href);

  const allAnchors = Array.from(document.querySelectorAll("a[href]"));
  const seasonRoot = document.querySelector(".infinite-scroll-component.seasonHeadData");
  const seasonAnchors = seasonRoot ? Array.from(seasonRoot.querySelectorAll("a[href]")) : [];
  const strongAnchors = allAnchors.filter((a) => isTv360EpisodeByParams(a.href));
  const sourceAnchors = strongAnchors.length ? strongAnchors : (seasonAnchors.length ? seasonAnchors : allAnchors);
  const episodeAnchors = sourceAnchors.filter((a) => isLikelyTv360EpisodeLink(a)).slice(0, 300);

  return {
    provider: "tv360",
    title,
    episodeTitle,
    currentEpisodeNumber,
    currentUrl: window.location.href,
    episodes: collectUniqueEpisodes(episodeAnchors)
  };
}

function extractTv360CurrentEpisodeNumber(rawTitle, episodeTitle, currentUrl) {
  const fromUrl = parseTv360EpisodeNumber(currentUrl);
  if (Number.isFinite(fromUrl)) return fromUrl;
  const fromEpisodeTitle = parseTv360EpisodeNumber(episodeTitle);
  if (Number.isFinite(fromEpisodeTitle)) return fromEpisodeTitle;
  const fromRawTitle = parseTv360EpisodeNumber(rawTitle);
  if (Number.isFinite(fromRawTitle)) return fromRawTitle;
  return NaN;
}

function parseTv360EpisodeNumber(text) {
  const m = String(text || "").match(/(?:tập|tap|episode|ep)\s*[_-]?(\d{1,3})/i) || String(text || "").match(/-tap-(\d{1,3})(?:[-/?]|$)/i);
  return m ? Number(m[1]) : NaN;
}
