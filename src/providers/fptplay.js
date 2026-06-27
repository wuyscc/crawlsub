function sanitizeFptSeriesTitle(rawTitle) {
  return String(rawTitle || "unknown")
    .replace(/\s*\|.*$/, "")
    .replace(/\s*\((?:season|phần|phan)\s*\d{1,2}\)\s*$/i, "")
    .replace(/\s*[-|:]\s*(?:season|phần|phan)\s*\d{1,2}\s*$/i, "")
    .trim();
}

function inferSeasonFromFptTitles(englishTitle, vietnameseTitle) {
  const fromEnglish = parseSeasonFromText(englishTitle);
  if (Number.isFinite(fromEnglish)) return fromEnglish;
  const fromVietnamese = parseSeasonFromText(vietnameseTitle);
  if (Number.isFinite(fromVietnamese)) return fromVietnamese;
  return NaN;
}

function parseSeasonFromText(text) {
  if (!text) return NaN;
  const match = text.match(/(?:season|phần|phan|s)\s*[_-]?(\d{1,2})/i);
  if (!match) return NaN;
  return Number(match[1]);
}

function isLikelyFptEpisodeLink(anchor) {
  const text = (anchor.textContent || "").trim();
  const href = anchor.href || "";
  if (!/fptplay\.vn/i.test(href)) return false;
  if (/trailer|teaser|preview/i.test(text) || /(?:^|[/-])trailer(?:$|[/?#-])/i.test(href)) return false;
  if (/\/xem-video\//i.test(href) && /\/tap-\d{1,3}(?:$|[/?#])/i.test(href)) return true;
  return /episode|tap-|\/xem\//i.test(href) || /ep|tập|phần/i.test(text);
}

function extractFptPlayContext() {
  const headerRoot = document.querySelector(".mb-4.xl\\:mb-6") || document;
  const englishTitle = headerRoot.querySelector("h2")?.textContent?.trim() || document.querySelector("h2")?.textContent?.trim() || "";
  const vietnameseTitle = headerRoot.querySelector("h1")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || "";
  const season = inferSeasonFromFptTitles(englishTitle, vietnameseTitle);
  const rawTitle =
    englishTitle ||
    vietnameseTitle ||
    document.querySelector(".ListEspisodeComponent span.line-clamp-1")?.textContent?.trim() ||
    document.querySelector(".title, .film-title")?.textContent?.trim() ||
    document.title ||
    "unknown";
  const title = sanitizeFptSeriesTitle(rawTitle);

  const episodeTitle =
    extractActiveFptEpisodeTitle() ||
    "";
  const currentEpisodeNumber = extractFptCurrentEpisodeNumber(episodeTitle, rawTitle, window.location.href);

  const sourceAnchors = Array.from(document.querySelectorAll(".ListEspisodeComponent.episode-list a.EpisodeItem[href]"));
  const episodeAnchors = sourceAnchors.filter((a) => isLikelyFptEpisodeLink(a)).slice(0, 220);

  return {
    provider: "fptplay",
    title,
    season,
    currentEpisodeNumber,
    currentUrl: window.location.href,
    episodeTitle,
    episodes: collectUniqueEpisodes(episodeAnchors)
  };
}

function extractActiveFptEpisodeTitle() {
  const activeAnchor = document.querySelector(".episode-list a.EpisodeItem.bg-charleston-green") || document.querySelector("a.EpisodeItem.bg-charleston-green");
  if (!activeAnchor) return document.querySelector(".episode-active, .active")?.textContent?.trim() || "";
  const titleNode = activeAnchor.querySelector("p");
  return titleNode?.textContent?.trim() || activeAnchor.textContent?.trim() || "";
}

function extractFptCurrentEpisodeNumber(episodeTitle, rawTitle, currentUrl) {
  const fromEpisodeTitle = parseFptEpisodeNumber(episodeTitle);
  if (Number.isFinite(fromEpisodeTitle)) return fromEpisodeTitle;
  const fromUrl = parseFptEpisodeNumber(currentUrl);
  if (Number.isFinite(fromUrl)) return fromUrl;
  const fromRawTitle = parseFptEpisodeNumber(rawTitle);
  if (Number.isFinite(fromRawTitle)) return fromRawTitle;
  return NaN;
}

function parseFptEpisodeNumber(text) {
  const m = String(text || "").match(/(?:tập|tap|episode|ep)\s*[_-]?(\d{1,3})/i) || String(text || "").match(/\/tap-(\d{1,3})(?:$|[/?#])/i);
  return m ? Number(m[1]) : NaN;
}
