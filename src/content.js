function extractPageContext() {
  const provider = detectProvider(window.location.hostname);
  const extractor = PROVIDER_EXTRACTORS[provider] || PROVIDER_EXTRACTORS.generic;
  return extractor();
}

function detectProvider(hostname) {
  const host = (hostname || "").toLowerCase();
  if (host === "tv360.vn" || host.endsWith(".tv360.vn")) return "tv360";
  if (host === "fptplay.vn" || host.endsWith(".fptplay.vn")) return "fptplay";
  return "generic";
}


function extractGenericContext() {
  const title = document.querySelector("h1")?.textContent?.trim() || document.title || "unknown";
  const episodeTitle = "";
  const episodeAnchors = Array.from(document.querySelectorAll("a[href]"))
    .filter((a) => /episode|tap-|\/xem\//i.test(a.href) || /ep|tập/i.test(a.textContent || ""))
    .slice(0, 100);

  return {
    provider: "generic",
    title,
    episodeTitle,
    episodes: collectUniqueEpisodes(episodeAnchors)
  };
}

function collectUniqueEpisodes(anchors) {
  const seen = new Set();
  const episodes = [];
  for (const a of anchors) {
    const normalized = normalizeEpisodeUrl(a.href);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    episodes.push({
      id: normalized,
      title: extractEpisodeTitle(a),
      episodeLabel: (a.querySelector(".css-1soi1kg")?.textContent || "").trim(),
      url: normalized
    });
  }
  episodes.sort((a, b) => inferEpisodeOrder(a) - inferEpisodeOrder(b));
  return episodes;
}

function normalizeEpisodeUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw, window.location.origin);
    return u.toString();
  } catch {
    return "";
  }
}

function extractEpisodeTitle(anchor) {
  const label = (anchor.getAttribute("aria-label") || "").trim();
  const text = (anchor.textContent || "").trim();
  return label || text || "episode";
}

function inferEpisodeOrder(ep) {
  const sources = [ep.episodeLabel || "", ep.title || "", ep.url || ""];
  for (const s of sources) {
    const m = s.match(/(?:tập|tap|episode|ep)[\s-]*(\d{1,3})/i) || s.match(/-tap-(\d{1,3})(?:[-/?]|$)/i);
    if (m) return Number(m[1]);
  }
  return Number.MAX_SAFE_INTEGER;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "EXTRACT_PAGE_CONTEXT") {
    sendResponse({ ok: true, context: extractPageContext() });
  }
});
