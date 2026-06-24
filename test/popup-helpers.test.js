const { test } = require("node:test");
const assert = require("node:assert/strict");
const { formatJobStatus, formatLogs } = require("../popup/popup-helpers.js");

test("formatJobStatus: single mode shows title and downloaded count", () => {
  const job = { mode: "single", title: "Drama Name", downloaded: 1, status: "completed" };
  assert.equal(formatJobStatus(job), "Drama Name  ·  1 downloaded");
});

test("formatJobStatus: single mode with 0 downloads", () => {
  const job = { mode: "single", title: "Drama Name", downloaded: 0, status: "completed" };
  assert.equal(formatJobStatus(job), "Drama Name  ·  0 downloaded");
});

test("formatJobStatus: full_season running shows progress bar", () => {
  const job = { mode: "full_season", title: "Drama", status: "running", processedEpisodes: 10, totalEpisodes: 20, downloaded: 8 };
  const result = formatJobStatus(job);
  assert.ok(result.includes("Episode 10 / 20"), `expected 'Episode 10 / 20' in: ${result}`);
  assert.ok(result.includes("8 downloaded"), `expected '8 downloaded' in: ${result}`);
  assert.ok(result.includes("██████████░░░░░░░░░░"), `expected progress bar in: ${result}`);
});

test("formatJobStatus: full_season running at 0% shows empty bar", () => {
  const job = { mode: "full_season", title: "Drama", status: "running", processedEpisodes: 0, totalEpisodes: 20, downloaded: 0 };
  const result = formatJobStatus(job);
  assert.ok(result.includes("░░░░░░░░░░░░░░░░░░░░"), `expected empty bar in: ${result}`);
});

test("formatJobStatus: full_season running at 100% shows full bar", () => {
  const job = { mode: "full_season", title: "Drama", status: "running", processedEpisodes: 20, totalEpisodes: 20, downloaded: 18 };
  const result = formatJobStatus(job);
  assert.ok(result.includes("████████████████████"), `expected full bar in: ${result}`);
});

test("formatJobStatus: full_season completed shows skipped count", () => {
  const job = { mode: "full_season", title: "Drama", status: "completed", processedEpisodes: 24, totalEpisodes: 24, downloaded: 20 };
  assert.equal(formatJobStatus(job), "Done  ·  24 episodes  ·  20 downloaded  ·  4 skipped");
});

test("formatJobStatus: full_season cancelled shows stopped message", () => {
  const job = { mode: "full_season", title: "Drama", status: "cancelled", processedEpisodes: 7, totalEpisodes: 24, downloaded: 5 };
  assert.equal(formatJobStatus(job), "Stopped at episode 7 / 24  ·  5 downloaded");
});

test("formatJobStatus: full_season error shows stopped message", () => {
  const job = { mode: "full_season", title: "Drama", status: "error", processedEpisodes: 3, totalEpisodes: 24, downloaded: 2 };
  assert.equal(formatJobStatus(job), "Stopped at episode 3 / 24  ·  2 downloaded");
});

test("formatJobStatus: title truncated at 30 chars", () => {
  const job = { mode: "single", title: "A".repeat(40), downloaded: 1, status: "completed" };
  const result = formatJobStatus(job);
  assert.ok(result.startsWith("A".repeat(30) + "  ·"), `title not truncated in: ${result}`);
});

test("formatLogs: empty array returns no-logs message", () => {
  assert.equal(formatLogs([]), "(no logs)");
});

test("formatLogs: null returns no-logs message", () => {
  assert.equal(formatLogs(null), "(no logs)");
});

test("formatLogs: formats a single entry correctly", () => {
  const logs = [{ ts: "2026-06-23T12:34:03.000Z", level: "info", event: "subtitle_downloaded", payload: { episode: "Tập 1", file: "drama.S01E01.vi.srt" } }];
  const result = formatLogs(logs);
  assert.ok(result.includes("12:34:03"), `missing timestamp in: ${result}`);
  assert.ok(result.includes("INFO"), `missing level in: ${result}`);
  assert.ok(result.includes("subtitle_downloaded"), `missing event in: ${result}`);
  assert.ok(result.includes("episode=Tập 1"), `missing payload key in: ${result}`);
  assert.ok(result.includes("file=drama.S01E01.vi.srt"), `missing payload value in: ${result}`);
});

test("formatLogs: entry with no payload omits trailing whitespace", () => {
  const logs = [{ ts: "2026-06-23T12:34:01.000Z", level: "warn", event: "full_crawl_no_episodes", payload: {} }];
  const result = formatLogs(logs);
  assert.ok(result.includes("WARN"), `missing level in: ${result}`);
  assert.ok(result.includes("full_crawl_no_episodes"), `missing event in: ${result}`);
  assert.ok(!result.endsWith("   "), `should not have trailing spaces: "${result}"`);
});

test("formatLogs: multiple entries joined by newlines", () => {
  const logs = [
    { ts: "2026-06-23T12:34:01.000Z", level: "info", event: "start", payload: {} },
    { ts: "2026-06-23T12:34:02.000Z", level: "info", event: "end", payload: {} }
  ];
  const lines = formatLogs(logs).split("\n");
  assert.equal(lines.length, 2);
});

test("formatLogs: level is uppercased and padded to 5 chars", () => {
  const logs = [{ ts: "2026-06-23T00:00:00.000Z", level: "info", event: "x", payload: {} }];
  const result = formatLogs(logs);
  assert.ok(result.includes("INFO "), `expected padded 'INFO ' in: ${result}`);
});
