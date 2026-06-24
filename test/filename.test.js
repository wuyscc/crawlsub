const test = require("node:test");
const assert = require("node:assert/strict");

const {
  safeFileName,
  dotCaseTitle,
  normalizeSeriesRawTitle,
  subtitleSourceLabel,
  detectSeasonEpisode,
  inferEpisodeNumber,
  parseEpisodeFromTapSlug,
  parseEpisodeFromTapText,
} = require("../src/filename.js");

// ---------------------------------------------------------------------------
// safeFileName
// ---------------------------------------------------------------------------

test("safeFileName: reserved chars are replaced with underscores", () => {
  const result = safeFileName('file\\/:*?"<>|name');
  assert.ok(!result.includes("\\"), "backslash should be replaced");
  assert.ok(!result.includes("/"), "slash should be replaced");
  assert.ok(!result.includes(":"), "colon should be replaced");
  assert.ok(!result.includes("*"), "asterisk should be replaced");
  assert.ok(!result.includes("?"), "question mark should be replaced");
  assert.ok(!result.includes('"'), "double quote should be replaced");
  assert.ok(!result.includes("<"), "less-than should be replaced");
  assert.ok(!result.includes(">"), "greater-than should be replaced");
  assert.ok(!result.includes("|"), "pipe should be replaced");
});

test("safeFileName: multiple spaces are normalized to single space", () => {
  assert.equal(safeFileName("hello   world"), "hello world");
});

test("safeFileName: leading and trailing spaces are trimmed", () => {
  assert.equal(safeFileName("  hello  "), "hello");
});

test("safeFileName: result is truncated at 120 chars", () => {
  const long = "a".repeat(200);
  assert.equal(safeFileName(long).length, 120);
});

// ---------------------------------------------------------------------------
// dotCaseTitle
// ---------------------------------------------------------------------------

test("dotCaseTitle: spaces and punctuation become dots", () => {
  assert.equal(dotCaseTitle("Hello World"), "Hello.World");
});

test("dotCaseTitle: multiple separators collapse to a single dot", () => {
  assert.equal(dotCaseTitle("Hello  --  World"), "Hello.World");
});

test("dotCaseTitle: leading and trailing dots are stripped", () => {
  const result = dotCaseTitle(" Hello World ");
  assert.ok(!result.startsWith("."), "should not start with dot");
  assert.ok(!result.endsWith("."), "should not end with dot");
});

test("dotCaseTitle: unicode letters and numbers are preserved", () => {
  const result = dotCaseTitle("Phim Việt 2024");
  assert.ok(result.includes("Việt"), "unicode letters should be preserved");
  assert.ok(result.includes("2024"), "numbers should be preserved");
});

test("dotCaseTitle: empty string returns 'video'", () => {
  assert.equal(dotCaseTitle(""), "video");
});

// ---------------------------------------------------------------------------
// normalizeSeriesRawTitle
// ---------------------------------------------------------------------------

test("normalizeSeriesRawTitle: strips 'Tập N' suffix", () => {
  assert.equal(normalizeSeriesRawTitle("Drama Title - Tập 5"), "Drama Title");
});

test("normalizeSeriesRawTitle: strips 'Episode N English Sub' suffix", () => {
  assert.equal(normalizeSeriesRawTitle("Drama Title Episode 12 English Sub"), "Drama Title");
});

test("normalizeSeriesRawTitle: strips parenthesized 'Tập N'", () => {
  // The first regex matches 'Tập 3)' inside the parens, leaving a trailing '('.
  // The second regex (for full parenthesized form) never gets a chance to fire
  assert.equal(normalizeSeriesRawTitle("Drama Title (Tập 3)"), "Drama Title");
});

test("normalizeSeriesRawTitle: already clean title is returned unchanged", () => {
  assert.equal(normalizeSeriesRawTitle("Clean Drama Title"), "Clean Drama Title");
});

test("normalizeSeriesRawTitle: empty string returns 'video'", () => {
  assert.equal(normalizeSeriesRawTitle(""), "video");
});

// ---------------------------------------------------------------------------
// subtitleSourceLabel
// ---------------------------------------------------------------------------

test("subtitleSourceLabel: tv360 → TV360", () => {
  assert.equal(subtitleSourceLabel({ provider: "tv360" }), "TV360");
});

test("subtitleSourceLabel: fptplay → FPTPLAY", () => {
  assert.equal(subtitleSourceLabel({ provider: "fptplay" }), "FPTPLAY");
});

test("subtitleSourceLabel: generic provider → UNKNOWN", () => {
  assert.equal(subtitleSourceLabel({ provider: "generic" }), "UNKNOWN");
});

test("subtitleSourceLabel: empty object → UNKNOWN", () => {
  assert.equal(subtitleSourceLabel({}), "UNKNOWN");
});

// ---------------------------------------------------------------------------
// parseEpisodeFromTapSlug
// ---------------------------------------------------------------------------

test("parseEpisodeFromTapSlug: -tap-5 → 5", () => {
  assert.equal(parseEpisodeFromTapSlug("https://example.com/phim/drama-tap-5"), 5);
});

test("parseEpisodeFromTapSlug: -tap-12- → 12", () => {
  assert.equal(parseEpisodeFromTapSlug("https://example.com/phim/drama-tap-12-vietsub"), 12);
});

test("parseEpisodeFromTapSlug: -tap-7?lang=vi → 7", () => {
  assert.equal(parseEpisodeFromTapSlug("https://example.com/phim/drama-tap-7?lang=vi"), 7);
});

test("parseEpisodeFromTapSlug: URL without tap slug → NaN", () => {
  assert.ok(Number.isNaN(parseEpisodeFromTapSlug("https://example.com/phim/drama")));
});

// ---------------------------------------------------------------------------
// parseEpisodeFromTapText
// ---------------------------------------------------------------------------

test("parseEpisodeFromTapText: 'Tập 3' → 3", () => {
  assert.equal(parseEpisodeFromTapText("Tập 3"), 3);
});

test("parseEpisodeFromTapText: 'tap 12' → 12", () => {
  assert.equal(parseEpisodeFromTapText("tap 12"), 12);
});

test("parseEpisodeFromTapText: 'Episode 5' → NaN (only matches tập/tap)", () => {
  assert.ok(Number.isNaN(parseEpisodeFromTapText("Episode 5")));
});

test("parseEpisodeFromTapText: empty string → NaN", () => {
  assert.ok(Number.isNaN(parseEpisodeFromTapText("")));
});

// ---------------------------------------------------------------------------
// inferEpisodeNumber
// ---------------------------------------------------------------------------

test("inferEpisodeNumber: episode object with title 'Tập 5' → 5", () => {
  assert.equal(inferEpisodeNumber({ title: "Tập 5" }, 99), 5);
});

test("inferEpisodeNumber: episode object with url containing -tap-3 → 3", () => {
  assert.equal(inferEpisodeNumber({ url: "/phim/drama-tap-3" }, 99), 3);
});

test("inferEpisodeNumber: episode object with episodeLabel 'Ep 7' → 7", () => {
  assert.equal(inferEpisodeNumber({ episodeLabel: "Ep 7" }, 99), 7);
});

test("inferEpisodeNumber: no match → returns fallback number", () => {
  assert.equal(inferEpisodeNumber({}, 42), 42);
});

// ---------------------------------------------------------------------------
// detectSeasonEpisode
// ---------------------------------------------------------------------------

test("detectSeasonEpisode: season from context.season with no other info", () => {
  const result = detectSeasonEpisode({}, { season: 2 });
  assert.equal(result.season, 2);
  assert.equal(result.episode, 1);
});

test("detectSeasonEpisode: episode from URL -tap-5 with tv360 provider", () => {
  const result = detectSeasonEpisode(
    { url: "/phim/drama-tap-5" },
    { provider: "tv360" }
  );
  assert.equal(result.episode, 5);
});

test("detectSeasonEpisode: season from title text 'Season 2'", () => {
  const result = detectSeasonEpisode({ title: "Drama Season 2" }, {});
  assert.equal(result.season, 2);
});

test("detectSeasonEpisode: unknown ep defaults to 1, unknown season defaults to 1", () => {
  const result = detectSeasonEpisode({}, {});
  assert.equal(result.season, 1);
  assert.equal(result.episode, 1);
});

test("detectSeasonEpisode: episode from episodeNumberOverride when nothing else matches", () => {
  const result = detectSeasonEpisode({}, { provider: "fptplay" }, 8);
  assert.equal(result.episode, 8);
});

test("detectSeasonEpisode: tv360 provider trusts episodeNumberOverride directly", () => {
  const result = detectSeasonEpisode(
    { title: "Drama Tập 3" },
    { provider: "tv360" },
    10
  );
  // tv360 with override ignores other episode signals
  assert.equal(result.episode, 10);
});
