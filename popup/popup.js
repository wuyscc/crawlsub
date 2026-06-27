const PREF_CONVERT = "crawlsub_pref_convert_to_srt";
const PREF_SKIP = "crawlsub_pref_skip_completed";
const PREF_RANGE = "crawlsub_pref_episode_range";
const PREF_BYPASS = "crawlsub_pref_bypass_crawl";
const PREF_INCLUDE_SOURCE = "crawlsub_pref_include_source";
const PREF_EPISODE_DELAY_MS = "crawlsub_pref_episode_delay_ms";
const PREF_SINGLE_DELAY_MS = "crawlsub_pref_single_delay_ms";
const PREF_THEME_MODE = "crawlsub_pref_theme_mode";
const PREF_ADVANCED_OPEN = "crawlsub_pref_advanced_open";
const DEFAULT_EPISODE_DELAY_MS = 1800; // Keep in sync with src/background.js
const DEFAULT_SINGLE_DELAY_MS = 3000; // Keep in sync with src/background.js
const api = globalThis.extensionApi;
let pollTimer = null;
let currentJobId = null;
let siteSupported = true;

async function getActiveTab() {
  const tabs = await api.queryTabs({ active: true, currentWindow: true });
  return tabs[0];
}

function setStatus(message, kind = "idle") {
  const status = document.getElementById("status");
  const badge = document.getElementById("badge");
  status.textContent = typeof message === "string" ? message : JSON.stringify(message, null, 2);
  badge.className = "status-tag";
  badge.dataset.kind = kind;
  if (kind === "working") return void (badge.textContent = "RUN");
  if (kind === "error") return void (badge.textContent = "ERR");
  if (kind === "success") return void (badge.textContent = "DONE");
  badge.textContent = "IDLE";
}

function applyTheme(mode) {
  const computed = mode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
  document.body.setAttribute("data-theme", computed);
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeMode === mode);
  });
}

async function detectCurrentSite() {
  const banner = document.getElementById("site-banner");
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    let provider = null;
    try {
      const resp = await api.sendTabMessage(tab.id, { type: "EXTRACT_PAGE_CONTEXT" });
      provider = resp?.ok ? (resp.context?.provider || null) : null;
    } catch {
      // content script not available (restricted page, new tab, etc.)
    }
    if (provider === "tv360" || provider === "fptplay") {
      banner.textContent = provider.toUpperCase();
      banner.className = "known";
    } else {
      banner.textContent = "? UNSUPPORTED — crawl may not work";
      banner.className = "unknown";
      siteSupported = false;
      document.getElementById("single").disabled = true;
      document.getElementById("full").disabled = true;
    }
  } catch {
    // fail silently — banner stays hidden
  }
}

function setBusy(disabled) {
  const crawlIds = siteSupported ? ["single", "full", "logs"] : ["logs"];
  crawlIds.forEach((id) => {
    document.getElementById(id).disabled = disabled;
  });
  const cancelBtn = document.getElementById("cancel");
  cancelBtn.disabled = disabled ? !currentJobId : true;
  const actions = document.querySelector(".actions");
  if (disabled) {
    actions.classList.add("running");
  } else {
    actions.classList.remove("running");
  }
}

function setLogsLoading(loading) {
  if (loading) {
    ["single", "full", "logs"].forEach((id) => {
      document.getElementById(id).disabled = true;
    });
  } else {
    document.getElementById("logs").disabled = false;
    if (siteSupported) {
      document.getElementById("single").disabled = false;
      document.getElementById("full").disabled = false;
    }
  }
}

function startJobPolling(jobId) {
  stopJobPolling();
  currentJobId = jobId;
  document.getElementById("cancel").disabled = false;
  pollTimer = setInterval(() => {
    api.sendRuntimeMessage({ type: "GET_CRAWL_STATUS", jobId })
      .then((resp) => {
        if (!resp?.ok || !resp.job) return;
        const job = resp.job;
        setStatus(formatJobStatus(job), job.status === "running" ? "working" : job.status === "completed" ? "success" : "error");
        if (job.status !== "running") {
          setBusy(false);
          stopJobPolling();
        }
      })
      .catch(() => {});
  }, 1200);
}

function stopJobPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  currentJobId = null;
  document.getElementById("cancel").disabled = true;
}

function cancelCurrentJob() {
  if (!currentJobId) {
    setStatus("No running full-season crawl to stop.", "error");
    return;
  }
  api.sendRuntimeMessage({ type: "CANCEL_CRAWL", jobId: currentJobId })
    .then((resp) => {
      if (!resp?.ok) return setStatus(`Error: ${resp?.error || "unknown"}`, "error");
      setStatus("Stopping full-season crawl...", "working");
    })
    .catch((error) => setStatus(`Error: ${error.message}`, "error"));
}

function getPrefs() {
  return {
    convertToSrt: document.getElementById("convert").checked,
    skipCompleted: document.getElementById("skipCompleted").checked,
    episodeRange: document.getElementById("episodeRange").value.trim(),
    bypassCrawl: document.getElementById("bypassCrawl").checked,
    includeSource: document.getElementById("includeSource").checked,
    episodeDelayMs: document.getElementById("episodeDelayMs").value.trim(),
    singleDelayMs: document.getElementById("singleDelayMs").value.trim()
  };
}

function savePrefs() {
  const prefs = getPrefs();
  api.storageSet({ [PREF_CONVERT]: prefs.convertToSrt, [PREF_SKIP]: prefs.skipCompleted, [PREF_RANGE]: prefs.episodeRange, [PREF_BYPASS]: prefs.bypassCrawl, [PREF_INCLUDE_SOURCE]: prefs.includeSource, [PREF_EPISODE_DELAY_MS]: prefs.episodeDelayMs, [PREF_SINGLE_DELAY_MS]: prefs.singleDelayMs });
}

function loadPrefs() {
  api.storageGet([PREF_CONVERT, PREF_SKIP, PREF_RANGE, PREF_BYPASS, PREF_INCLUDE_SOURCE, PREF_EPISODE_DELAY_MS, PREF_SINGLE_DELAY_MS, PREF_THEME_MODE, PREF_ADVANCED_OPEN]).then((res) => {
    document.getElementById("convert").checked = res[PREF_CONVERT] === undefined ? true : !!res[PREF_CONVERT];
    document.getElementById("skipCompleted").checked = res[PREF_SKIP] === undefined ? true : !!res[PREF_SKIP];
    document.getElementById("episodeRange").value = typeof res[PREF_RANGE] === "string" ? res[PREF_RANGE] : "";
    document.getElementById("bypassCrawl").checked = !!res[PREF_BYPASS];
    document.getElementById("includeSource").checked = res[PREF_INCLUDE_SOURCE] === undefined ? true : !!res[PREF_INCLUDE_SOURCE];
    document.getElementById("episodeDelayMs").value = String(res[PREF_EPISODE_DELAY_MS] || DEFAULT_EPISODE_DELAY_MS);
    document.getElementById("singleDelayMs").value = String(res[PREF_SINGLE_DELAY_MS] !== undefined ? res[PREF_SINGLE_DELAY_MS] : DEFAULT_SINGLE_DELAY_MS);
    applyTheme(res[PREF_THEME_MODE] || "system");
    const isOpen = !!res[PREF_ADVANCED_OPEN];
    const body = document.getElementById("advanced-body");
    const toggle = document.getElementById("advanced-toggle");
    if (body) body.classList.toggle("open", isOpen);
    if (toggle) toggle.textContent = isOpen ? "▾ ADVANCED" : "▸ ADVANCED";
  });
}

function parseEpisodeRangeInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const m = text.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
  if (!m) return { error: "Episode range must be like 1-7" };
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1) {
    return { error: "Episode range must use positive numbers" };
  }
  if (from > to) return { error: "Episode range start must be <= end" };
  return { from, to };
}

async function sendAction(type, overrides = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("No active tab", "error");
    return;
  }

  const { convertToSrt, skipCompleted, episodeRange, bypassCrawl, includeSource, episodeDelayMs, singleDelayMs } = getPrefs();
  const parsedRange = type === "START_FULL_SEASON_CRAWL" ? parseEpisodeRangeInput(episodeRange) : null;
  if (parsedRange?.error) {
    setStatus(`Error: ${parsedRange.error}`, "error");
    return;
  }
  setBusy(true);
  setStatus("Working...", "working");

  api.sendRuntimeMessage({ type, tabId: tab.id, convertToSrt, skipCompleted, bypassCrawl, includeSource, episodeDelayMs, singleDelayMs, episodeRange: parsedRange || undefined, ...overrides })
    .then((resp) => {
      if (!resp?.ok) return setStatus(`Error: ${resp?.error || "unknown"}`, "error");
      if (type === "START_FULL_SEASON_CRAWL" && resp.result?.id) {
        startJobPolling(resp.result.id);
        return;
      }
      setBusy(false);
      setStatus(resp.result || resp.job || "Done", "success");
    })
    .catch((error) => {
      setBusy(false);
      setStatus(`Error: ${error.message}`, "error");
    });
}

function fetchLogs() {
  setLogsLoading(true);
  setStatus("Loading logs...", "working");
  api.sendRuntimeMessage({ type: "GET_DEBUG_LOG" })
    .then((resp) => {
      setLogsLoading(false);
      if (!resp?.ok) return setStatus(`Error: ${resp?.error || "unknown"}`, "error");
      setStatus(formatLogs(resp.logs || []), "success");
    })
    .catch((error) => {
      setLogsLoading(false);
      setStatus(`Error: ${error.message}`, "error");
    });
}

function init() {
  loadPrefs();
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.themeMode;
      api.storageSet({ [PREF_THEME_MODE]: mode });
      applyTheme(mode);
    });
  });
  document.getElementById("convert").addEventListener("change", savePrefs);
  document.getElementById("skipCompleted").addEventListener("change", savePrefs);
  document.getElementById("episodeRange").addEventListener("change", savePrefs);
  document.getElementById("episodeDelayMs").addEventListener("change", savePrefs);
  document.getElementById("singleDelayMs").addEventListener("change", savePrefs);
  document.getElementById("bypassCrawl").addEventListener("change", savePrefs);
  document.getElementById("includeSource").addEventListener("change", savePrefs);
  document.getElementById("single").addEventListener("click", () => sendAction("START_SINGLE_CRAWL"));
  document.getElementById("full").addEventListener("click", () => sendAction("START_FULL_SEASON_CRAWL"));
  document.getElementById("cancel").addEventListener("click", cancelCurrentJob);
  document.getElementById("logs").addEventListener("click", fetchLogs);
  document.getElementById("cancel").disabled = true;
  document.getElementById("advanced-toggle")?.addEventListener("click", () => {
    const body = document.getElementById("advanced-body");
    const toggle = document.getElementById("advanced-toggle");
    const isOpen = body.classList.toggle("open");
    if (toggle) toggle.textContent = isOpen ? "▾ ADVANCED" : "▸ ADVANCED";
    api.storageSet({ [PREF_ADVANCED_OPEN]: isOpen });
  });
  detectCurrentSite();
}

init();
