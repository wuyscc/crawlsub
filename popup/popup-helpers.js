function formatJobStatus(job) {
  const title = String(job.title || "").slice(0, 38);
  if (job.mode === "single") {
    return `${title}\n  └─ ${job.downloaded || 0} subtitle(s) downloaded`;
  }
  const processed = job.processedEpisodes || 0;
  const total = job.totalEpisodes || 0;
  const downloaded = job.downloaded || 0;
  if (job.status === "running") {
    const pct = total > 0 ? processed / total : 0;
    const barWidth = 26;
    const filled = Math.round(pct * barWidth);
    const bar = "▓".repeat(filled) + "░".repeat(barWidth - filled);
    const pctStr = String(Math.round(pct * 100)).padStart(3);
    return `${title}\n  [${bar}] ${pctStr}%\n  Ep ${processed}/${total}  ·  ${downloaded} ↓`;
  }
  if (job.status === "completed") {
    const skipped = Math.max(0, total - downloaded);
    return `${title}\n  └─ ${total} eps  ·  ${downloaded} ↓  ·  ${skipped} skipped`;
  }
  return `${title}\n  └─ Stopped at ep ${processed}/${total}  ·  ${downloaded} ↓`;
}

function formatLogs(logs) {
  if (!logs || !logs.length) return "(no logs)";
  return logs.map((entry) => {
    const ts = String(entry.ts || "").slice(11, 19);
    const level = String(entry.level || "").toUpperCase().slice(0, 4).padEnd(4);
    const event = String(entry.event || "");
    const payload = entry.payload
      ? Object.entries(entry.payload)
          .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
          .join("  ")
      : "";
    return `${ts} [${level}] ${event}${payload ? "  " + payload : ""}`;
  }).join("\n");
}

if (typeof module !== "undefined") {
  module.exports = { formatJobStatus, formatLogs };
}
