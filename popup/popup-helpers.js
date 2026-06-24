function formatJobStatus(job) {
  const title = String(job.title || "").slice(0, 30);
  if (job.mode === "single") {
    return `${title}  ·  ${job.downloaded || 0} downloaded`;
  }
  const processed = job.processedEpisodes || 0;
  const total = job.totalEpisodes || 0;
  const downloaded = job.downloaded || 0;
  if (job.status === "running") {
    const pct = total > 0 ? processed / total : 0;
    const filled = Math.round(pct * 20);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    return `${title}  ·  Episode ${processed} / ${total}  ·  ${downloaded} downloaded\n${bar}`;
  }
  if (job.status === "completed") {
    const skipped = Math.max(0, total - downloaded);
    return `Done  ·  ${total} episodes  ·  ${downloaded} downloaded  ·  ${skipped} skipped`;
  }
  return `Stopped at episode ${processed} / ${total}  ·  ${downloaded} downloaded`;
}

function formatLogs(logs) {
  if (!logs || !logs.length) return "(no logs)";
  return logs.map((entry) => {
    const ts = String(entry.ts || "").slice(11, 19);
    const level = String(entry.level || "").toUpperCase().padEnd(5);
    const event = String(entry.event || "");
    const payload = entry.payload
      ? Object.entries(entry.payload).map(([k, v]) => `${k}=${v}`).join("  ")
      : "";
    return `${ts}  ${level}  ${event}${payload ? "   " + payload : ""}`;
  }).join("\n");
}

if (typeof module !== "undefined") {
  module.exports = { formatJobStatus, formatLogs };
}
