if (typeof importScripts === "function") {
  importScripts("extension-api.js");
  importScripts("download-url.js");
  importScripts("subtitle.js");
  importScripts("filename.js");
}

const api = globalThis.extensionApi;

const SUPPORTED_HOSTS = ["tv360.vn", "fptplay.vn", "fptplay.net", "fptplay53.net"];
const TAB_CACHE_LIMIT = 200;
const DEFAULT_EPISODE_DELAY_MS = 1800; // Keep in sync with popup/popup.js
const MIN_EPISODE_DELAY_MS = 300;
const MAX_EPISODE_DELAY_MS = 15000;
const DEFAULT_SINGLE_DELAY_MS = 3000; // Keep in sync with popup/popup.js
const MIN_SINGLE_DELAY_MS = 0;

const requestCacheByTab = new Map();
const jobs = new Map();
const completedUrlCache = new Map();
const debugLog = [];
const DEBUG_LOG_LIMIT = 400;

const PROVIDER_RULES = {
  default: {
    keepEpisodesInScope: (episodes) => episodes,
    canNavigateToEpisode: () => true,
    shouldStopAfterEpisode: () => false,
    onAfterFullCrawl: () => {}
  },
  fptplay: {
    keepEpisodesInScope: (episodes, context) => {
      const basePrefix = fptSeasonPrefix(context?.currentUrl || "");
      if (!basePrefix) return episodes;
      return episodes.filter((ep) => fptSeasonPrefix(ep?.url || "") === basePrefix);
    },
    canNavigateToEpisode: (ep, context) => {
      const basePrefix = fptSeasonPrefix(context?.currentUrl || "");
      if (!basePrefix) return true;
      return fptSeasonPrefix(ep?.url || "") === basePrefix;
    },
    shouldStopAfterEpisode: ({ ep, index, maxListedEpisodeNumber }) => {
      const currentEpisodeNumber = inferEpisodeNumber(ep, index + 1);
      return Number.isFinite(currentEpisodeNumber) && currentEpisodeNumber >= maxListedEpisodeNumber;
    },
    onAfterFullCrawl: ({ tabId, lastVisitedEpisodeUrl }) => {
      if (lastVisitedEpisodeUrl) preventFptPostCrawlRedirect(tabId, lastVisitedEpisodeUrl, 20000);
    }
  }
};

chrome.runtime.onInstalled.addListener((details) => {
  api.storageSet({ crawlsub_jobs: {}, crawlsub_completed: {} });
  updateActionBadge("idle");
  if (details.reason === "install") {
    api.notify("Welcome to CrawlSub!", "Pin CrawlSub to your toolbar for quick access.");
  }
});

loadCompletedCache();

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!details.tabId || details.tabId < 0) return;
    if (!isSupportedUrl(details.url)) return;

    const contentType = headerValue(details.responseHeaders, "content-type");
    if (!looksLikeSubtitle(details.url, contentType)) return;

    const entry = {
      url: details.url,
      method: details.method,
      statusCode: details.statusCode,
      timeStamp: details.timeStamp,
      contentType: contentType || "",
      format: inferFormat(details.url, contentType)
    };

    const arr = requestCacheByTab.get(details.tabId) || [];
    arr.push(entry);
    if (arr.length > TAB_CACHE_LIMIT) arr.splice(0, arr.length - TAB_CACHE_LIMIT);
    requestCacheByTab.set(details.tabId, arr);
  },
  {
    urls: ["https://*.tv360.vn/*", "https://*.fptplay.vn/*", "https://*.fptplay.net/*", "https://*.fptplay53.net/*"]
  },
  ["responseHeaders"]
);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "GET_TAB_CANDIDATES") {
        const candidates = requestCacheByTab.get(msg.tabId) || [];
        sendResponse({ ok: true, candidates });
        return;
      }

      if (msg?.type === "START_SINGLE_CRAWL") {
        const singleDelayMs = normalizeSingleDelayMs(msg.singleDelayMs);
        updateActionBadge("running");
        logDebug("info", "single_crawl_start", { tabId: msg.tabId, convertToSrt: !!msg.convertToSrt, singleDelayMs });
        const result = await startSingleCrawl(msg.tabId, !!msg.convertToSrt, msg.includeSource !== false, singleDelayMs);
        updateActionBadge("success");
        api.notify("Single crawl finished", `Downloaded ${result.downloaded} subtitle(s).`);
        sendResponse({ ok: true, result });
        return;
      }

      if (msg?.type === "START_FULL_SEASON_CRAWL") {
        const episodeDelayMs = normalizeEpisodeDelayMs(msg.episodeDelayMs);
        const includeSource = msg.includeSource !== false;
        updateActionBadge("running");
        logDebug("info", "full_crawl_start", { tabId: msg.tabId, convertToSrt: !!msg.convertToSrt, skipCompleted: !!msg.skipCompleted, forceRerun: !!msg.forceRerun, episodeDelayMs, includeSource });
        const result = await startFullSeasonCrawl(msg.tabId, !!msg.convertToSrt, !!msg.skipCompleted, !!msg.forceRerun, msg.episodeRange || null, !!msg.bypassCrawl, episodeDelayMs, includeSource, true);
        sendResponse({ ok: true, result });
        return;
      }

      if (msg?.type === "GET_DEBUG_LOG") {
        sendResponse({ ok: true, logs: debugLog });
        return;
      }

      if (msg?.type === "GET_CRAWL_STATUS") {
        sendResponse({ ok: true, job: jobs.get(msg.jobId) || null });
        return;
      }

      if (msg?.type === "CANCEL_CRAWL") {
        const job = jobs.get(msg.jobId);
        if (job) {
          job.status = "cancelled";
          persistJobs();
        }
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (err) {
      updateActionBadge("error");
      api.notify("CrawlSub error", String(err?.message || err));
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true;
});

async function startSingleCrawl(tabId, convertToSrt, includeSource, singleDelayMs = DEFAULT_SINGLE_DELAY_MS) {
  let candidates = dedupeByUrl((requestCacheByTab.get(tabId) || []).slice().reverse());
  let context;

  if (candidates.length === 0) {
    requestCacheByTab.set(tabId, []);
    const captureStart = Date.now();
    await api.updateTab(tabId, { active: true });
    await api.reloadTab(tabId);
    await waitForTabComplete(tabId, 10000, null, true);
    if (singleDelayMs > 0) await sleep(singleDelayMs);
    context = await requestPageContextWithRetry(tabId);
    await waitForSubtitleCandidates(tabId, captureStart, 5000);
    candidates = dedupeByUrl(
      (requestCacheByTab.get(tabId) || [])
        .filter((c) => c.timeStamp >= captureStart)
        .slice()
        .reverse()
    );
  } else {
    context = await requestPageContextWithRetry(tabId);
  }

  const selected = selectBestSubtitleCandidates(candidates.slice(0, 5), 1);
  const downloaded = [];
  for (const c of selected) {
    const out = await downloadCandidate(c, context, convertToSrt, null, undefined, includeSource);
    if (out) downloaded.push(out);
  }

  return {
    mode: "single",
    title: context?.title || "unknown",
    downloaded: downloaded.length,
    files: downloaded
  };
}

async function startFullSeasonCrawl(tabId, convertToSrt, skipCompleted, forceRerun, episodeRange, bypassCrawl, episodeDelayMs, includeSource, kickoffOnly = false) {
  const context = await requestPageContextWithRetry(tabId);
  const provider = String(context?.provider || "").toLowerCase();
  const providerRules = PROVIDER_RULES[provider] || PROVIDER_RULES.default;
  const titleKey = titleCacheKey(context.title);
  const seasonEpisodes = providerRules.keepEpisodesInScope(context.episodes || [], context);
  const episodes = filterEpisodesByRange(seasonEpisodes, episodeRange);
  const maxListedEpisodeNumber = episodes.reduce((max, ep, idx) => {
    const n = inferEpisodeNumber(ep, idx + 1);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  const jobId = `job_${Date.now()}`;
  const job = {
    id: jobId,
    mode: "full_season",
    status: "running",
    title: context.title,
    totalEpisodes: episodes.length,
    processedEpisodes: 0,
    downloaded: 0,
    files: [],
    startedAt: Date.now()
  };
  jobs.set(jobId, job);
  persistJobs();
  if (kickoffOnly) {
    runFullSeasonJob(job, tabId, context, episodes, { convertToSrt, skipCompleted, forceRerun, bypassCrawl, episodeDelayMs, includeSource, providerRules, provider, titleKey, maxListedEpisodeNumber }).catch((err) => {
      job.status = "error";
      persistJobs();
      updateActionBadge("error");
      api.notify("CrawlSub error", String(err?.message || err));
      logDebug("error", "full_crawl_failed", { jobId: job.id, error: String(err?.message || err) });
    });
    return { id: job.id, status: job.status, totalEpisodes: job.totalEpisodes };
  }
  return runFullSeasonJob(job, tabId, context, episodes, { convertToSrt, skipCompleted, forceRerun, bypassCrawl, episodeDelayMs, includeSource, providerRules, provider, titleKey, maxListedEpisodeNumber });
}

async function runFullSeasonJob(job, tabId, context, episodes, cfg) {
  const { convertToSrt, skipCompleted, forceRerun, bypassCrawl, episodeDelayMs, includeSource, providerRules, provider, titleKey, maxListedEpisodeNumber } = cfg;
  if (!episodes.length) {
    logDebug("warn", "full_crawl_no_episodes", { tabId, title: context.title });
  }
  const jobSeenUrls = new Set();
  let lastVisitedEpisodeUrl = "";
  const completedForTitle = forceRerun ? new Set() : getCompletedSet(titleKey);
  if (forceRerun) {
    clearCompletedSet(titleKey);
    logDebug("info", "rerun_reset_completed", { title: context.title, titleKey });
  }

  for (let i = 0; i < episodes.length; i += 1) {
    const ep = episodes[i];
    if (job.status === "cancelled") break;
    requestCacheByTab.set(tabId, []);
    const captureStart = Date.now();

    if (!bypassCrawl && ep.url) {
      if (!providerRules.canNavigateToEpisode(ep, context)) {
        logDebug("warn", "provider_skip_cross_series_navigation", { provider, episode: ep.title, epUrl: ep.url });
        job.processedEpisodes += 1;
        persistJobs();
        continue;
      }
      await api.updateTab(tabId, { url: ep.url });
      await waitForTabComplete(tabId, 12000, job, true);
      if (job.status === "cancelled") break;
      await sleepWithCancel(job, episodeDelayMs);
      if (job.status === "cancelled") break;
      lastVisitedEpisodeUrl = ep.url;
    }

    const epContext = bypassCrawl ? context : await requestPageContextWithRetry(tabId);
    if (job.status === "cancelled") break;
    await waitForSubtitleCandidates(tabId, captureStart, bypassCrawl ? 800 : 3500, job);
    const candidates = (requestCacheByTab.get(tabId) || [])
      .filter((c) => c.timeStamp >= captureStart)
      .slice()
      .reverse();
    const dedup = dedupeByUrl(candidates)
      .filter((c) => !jobSeenUrls.has(c.url))
      .filter((c) => !skipCompleted || !completedForTitle.has(c.url))
      .slice(0, 5);
    const selected = selectBestSubtitleCandidates(dedup, 1);
    logDebug("debug", "episode_candidates", { episode: ep.title, totalCandidates: candidates.length, dedupCandidates: dedup.length });

    for (const c of selected) {
      if (job.status === "cancelled") break;
      const out = await downloadCandidate(c, epContext, convertToSrt, ep, i + 1, includeSource);
      if (out) {
        job.files.push(out);
        job.downloaded += 1;
        jobSeenUrls.add(c.url);
        completedForTitle.add(c.url);
        logDebug("info", "subtitle_downloaded", { episode: ep.title, url: c.url, filename: out.filename, converted: !!out.converted });
      }
    }

    job.processedEpisodes += 1;
    persistJobs();

    if (providerRules.shouldStopAfterEpisode({ ep, index: i, episodes, maxListedEpisodeNumber, context })) {
      logDebug("info", "provider_reached_end_of_episode_list", { provider, maxListedEpisodeNumber, episode: ep.title });
      break;
    }
  }

  if (job.status !== "cancelled") job.status = "completed";
  job.finishedAt = Date.now();
  saveCompletedSet(titleKey, completedForTitle);
  persistJobs();

  providerRules.onAfterFullCrawl({ tabId, context, lastVisitedEpisodeUrl, job });

  logDebug("info", "full_crawl_keep_last_episode", { tabId, provider, status: job.status });

  logDebug("info", "full_crawl_finished", { jobId: job.id, status: job.status, downloaded: job.downloaded, processedEpisodes: job.processedEpisodes });
  if (job.status === "cancelled") {
    updateActionBadge("error");
    api.notify("Full season crawl cancelled", `Processed ${job.processedEpisodes}/${job.totalEpisodes} episodes.`);
  } else {
    updateActionBadge("success");
    api.notify("Full season crawl finished", `Downloaded ${job.downloaded} subtitle(s).`);
  }
  return job;
}

function preventFptPostCrawlRedirect(tabId, lockedUrl, windowMs) {
  const effectiveWindowMs = Math.max(1000, Number(windowMs) || 20000);
  const lockUntil = Date.now() + effectiveWindowMs;

  api.updateTab(tabId, { url: lockedUrl });

  function onUpdated(updatedTabId, changeInfo, tab) {
    if (updatedTabId !== tabId) return;
    if (Date.now() > lockUntil) {
      api.removeTabUpdatedListener(onUpdated);
      return;
    }
    if (!changeInfo.url || !tab?.url) return;
    if (tab.url === lockedUrl) return;
    try {
      const nextUrl = new URL(tab.url);
      const keepUrl = new URL(lockedUrl);
      const sameHost = nextUrl.hostname === keepUrl.hostname;
      if (!sameHost || tab.url.includes("/trang-chu") || tab.url.includes("/home")) {
        api.updateTab(tabId, { url: lockedUrl });
        logDebug("warn", "fpt_redirect_blocked", { tabId, from: tab.url, to: lockedUrl });
      }
    } catch {
      api.updateTab(tabId, { url: lockedUrl });
    }
  }

  api.addTabUpdatedListener(onUpdated);
  setTimeout(() => api.removeTabUpdatedListener(onUpdated), effectiveWindowMs + 500);
}

function filterEpisodesByRange(episodes, range) {
  if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) return episodes;
  return episodes.filter((ep, idx) => {
    const n = inferEpisodeNumber(ep, idx + 1);
    return n >= range.from && n <= range.to;
  });
}

function fptSeasonPrefix(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^(\/xem-video\/[^/]+\/)[^/]+$/i);
    return m ? m[1].toLowerCase() : "";
  } catch {
    return "";
  }
}

function selectBestSubtitleCandidates(candidates, maxCount) {
  const scored = candidates
    .map((c) => ({ c, score: subtitleCandidateScore(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxCount));
  return scored.map((x) => x.c);
}

function normalizeEpisodeDelayMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_EPISODE_DELAY_MS;
  const rounded = Math.round(n);
  if (rounded < MIN_EPISODE_DELAY_MS) return MIN_EPISODE_DELAY_MS;
  if (rounded > MAX_EPISODE_DELAY_MS) return MAX_EPISODE_DELAY_MS;
  return rounded;
}

function normalizeSingleDelayMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SINGLE_DELAY_MS;
  const rounded = Math.round(n);
  if (rounded < MIN_SINGLE_DELAY_MS) return MIN_SINGLE_DELAY_MS;
  if (rounded > MAX_EPISODE_DELAY_MS) return MAX_EPISODE_DELAY_MS;
  return rounded;
}

async function waitForSubtitleCandidates(tabId, captureStart, maxWaitMs, job = null) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    if (job?.status === "cancelled") return;
    const fresh = (requestCacheByTab.get(tabId) || []).filter((c) => c.timeStamp >= captureStart);
    if (fresh.length > 0) return;
    await sleepWithCancel(job, 250);
  }
}

async function requestPageContext(tabId) {
  try {
    const resp = await api.sendTabMessage(tabId, { type: "EXTRACT_PAGE_CONTEXT" });
    return resp?.ok ? (resp.context || { title: "unknown", episodes: [] }) : { title: "unknown", episodes: [] };
  } catch {
    return { title: "unknown", episodes: [] };
  }
}

async function requestPageContextWithRetry(tabId) {
  const first = await requestPageContext(tabId);
  if (first?.title && first.title !== "unknown" && (first.episodes?.length || first.episodeTitle)) {
    return first;
  }

  await waitForTabComplete(tabId, 6000);
  await sleep(800);
  const second = await requestPageContext(tabId);
  if (second?.title && second.title !== "unknown") return second;

  logDebug("warn", "page_context_unknown", { tabId, first, second });
  return second || first || { title: "unknown", episodes: [] };
}

async function waitForTabComplete(tabId, timeoutMs, job = null, requireNavigation = false) {
  return new Promise((resolve) => {
    let done = false;
    let seenLoading = false;
    const timer = setTimeout(() => finish(), timeoutMs);
    const cancelTimer = job ? setInterval(() => {
      if (job.status === "cancelled") finish();
    }, 100) : null;

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (cancelTimer) clearInterval(cancelTimer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "loading") seenLoading = true;
      if (changeInfo.status === "complete" && (!requireNavigation || seenLoading)) finish();
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    api.getTab(tabId).then((tab) => {
      if (!tab) { finish(); return; }
      if (tab.status === "loading") seenLoading = true;
      if (tab.status === "complete" && (!requireNavigation || seenLoading)) finish();
    }).catch(() => finish());
  });
}

function dedupeByUrl(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const key = canonicalSubtitleUrl(c.url);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

function canonicalSubtitleUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    u.searchParams.sort();
    const volatileParams = ["t", "ts", "timestamp", "token", "sig", "signature", "expires", "exp", "x-amz-signature", "x-amz-date", "x-amz-expires", "x-amz-security-token"];
    for (const key of volatileParams) {
      u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return String(rawUrl || "");
  }
}

async function downloadCandidate(candidate, context, convertToSrt, ep, episodeNumberOverride, includeSource = true) {
  const seriesTitle = normalizeSeriesRawTitle(context.title || "video");
  const folderName = safeFileName(dotCaseTitle(seriesTitle));
  const seasonEpisode = detectSeasonEpisode(ep, context, episodeNumberOverride);
  const seasonPart = String(seasonEpisode.season).padStart(2, "0");
  const episodePart = String(seasonEpisode.episode).padStart(2, "0");
  const seasonFolder = `S${seasonPart}`;
  const langCode = "vi";
  const source = subtitleSourceLabel(context);
  const compactTitle = dotCaseTitle(seriesTitle);
  const sourcePart = includeSource ? `.${source}` : "";
  const baseName = safeFileName(`${compactTitle}.S${seasonPart}E${episodePart}${sourcePart}.${langCode}`);

  if (!convertToSrt || candidate.format === "srt") {
    const filename = `crawlsub/${folderName}/${seasonFolder}/${baseName}.${candidate.format || "vtt"}`;
    const id = await api.download({ url: candidate.url, filename, saveAs: false });
    return { id, url: candidate.url, filename, converted: false };
  }

  const text = await fetchText(candidate.url);
  if (!text) return null;
  const isVttPayload = looksLikeVttPayload(text);
  const canConvertToSrt = candidate.format === "vtt" || (candidate.format === "unknown" && isVttPayload);

  if (!canConvertToSrt) {
    const fallbackExt = candidate.format && candidate.format !== "unknown" ? candidate.format : "vtt";
    const filename = `crawlsub/${folderName}/${seasonFolder}/${baseName}.${fallbackExt}`;
    const id = await api.download({ url: candidate.url, filename, saveAs: false });
    return { id, url: candidate.url, filename, converted: false, reason: "unsupported_format" };
  }

  const srt = vttToSrt(text);
  const blobUrl = createDownloadUrl(srt, "application/x-subrip;charset=utf-8");
  const filename = `crawlsub/${folderName}/${seasonFolder}/${baseName}.srt`;
  try {
    const id = await api.download({ url: blobUrl, filename, saveAs: false });
    return { id, url: candidate.url, filename, converted: true };
  } finally {
    setTimeout(() => revokeDownloadUrl(blobUrl), 1000);
  }
}

async function fetchText(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function headerValue(headers, key) {
  if (!headers) return "";
  const lowerKey = key.toLowerCase();
  const h = headers.find((x) => (x.name || "").toLowerCase() === lowerKey);
  return h?.value || "";
}

function isSupportedUrl(url) {
  try {
    const h = new URL(url).hostname;
    return SUPPORTED_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sleepWithCancel(job, ms) {
  const waitMs = Math.max(0, Number(ms) || 0);
  const startedAt = Date.now();
  while (Date.now() - startedAt < waitMs) {
    if (job?.status === "cancelled") return;
    await sleep(Math.min(100, waitMs - (Date.now() - startedAt)));
  }
}

function persistJobs() {
  const obj = {};
  for (const [k, v] of jobs.entries()) obj[k] = v;
  api.storageSet({ crawlsub_jobs: obj });
}

function updateActionBadge(state) {
  api.setBadge(state);
}

function titleCacheKey(title) {
  return normalizeSeriesKey(title);
}

function getCompletedSet(titleKey) {
  const existing = completedUrlCache.get(titleKey);
  if (existing) return new Set(existing);
  return new Set();
}

function saveCompletedSet(titleKey, set) {
  completedUrlCache.set(titleKey, Array.from(set));
  api.storageSet({ crawlsub_completed: Object.fromEntries(completedUrlCache.entries()) });
}

function clearCompletedSet(titleKey) {
  completedUrlCache.delete(titleKey);
  api.storageSet({ crawlsub_completed: Object.fromEntries(completedUrlCache.entries()) });
}

function loadCompletedCache() {
  api.storageGet(["crawlsub_completed"]).then((res) => {
    const raw = res?.crawlsub_completed || {};
    for (const [key, arr] of Object.entries(raw)) {
      if (Array.isArray(arr)) completedUrlCache.set(key, arr);
    }
  }).catch(() => {});
}

function logDebug(level, event, payload = {}) {
  debugLog.push({ ts: new Date().toISOString(), level, event, payload });
  if (debugLog.length > DEBUG_LOG_LIMIT) {
    debugLog.splice(0, debugLog.length - DEBUG_LOG_LIMIT);
  }
}

function normalizeSeriesKey(title) {
  return safeFileName(normalizeSeriesRawTitle(title)).toLowerCase();
}
