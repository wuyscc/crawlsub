const test = require("node:test");
const assert = require("node:assert/strict");

const {
  vttToSrt,
  normalizeTiming,
  looksLikeVttPayload,
  inferFormat,
  looksLikeSubtitle,
  subtitleCandidateScore,
  safeHostname,
} = require("../src/subtitle.js");

// ---------------------------------------------------------------------------
// vttToSrt
// ---------------------------------------------------------------------------

test("vttToSrt: single cue produces correct SRT block", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello world
`;
  const result = vttToSrt(vtt);
  assert.ok(result.includes("1\n"), "missing index line");
  assert.ok(result.includes("00:00:01,000 --> 00:00:02,000"), "timing line wrong");
  assert.ok(result.includes("Hello world"), "missing text");
});

test("vttToSrt: multiple cues get sequential numbering", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
First

00:00:03.000 --> 00:00:04.000
Second
`;
  const result = vttToSrt(vtt);
  const lines = result.split("\n");
  assert.equal(lines[0], "1");
  // find "2" index line
  const idx2 = lines.indexOf("2");
  assert.ok(idx2 > 0, "second index not found");
  assert.ok(lines[idx2 + 1].includes("00:00:03,000 --> 00:00:04,000"), "second timing wrong");
  assert.ok(lines[idx2 + 2].includes("Second"), "second text wrong");
});

test("vttToSrt: WEBVTT header line is stripped", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Text
`;
  const result = vttToSrt(vtt);
  assert.ok(!result.includes("WEBVTT"), "WEBVTT header should not appear in SRT output");
});

test("vttToSrt: NOTE blocks are stripped", () => {
  const vtt = `WEBVTT

NOTE This is a comment

00:00:01.000 --> 00:00:02.000
Text
`;
  const result = vttToSrt(vtt);
  assert.ok(!result.includes("NOTE"), "NOTE block should be stripped");
  assert.ok(result.includes("Text"), "cue text should still be present");
});

test("vttToSrt: STYLE blocks are stripped", () => {
  const vtt = `WEBVTT

STYLE
::cue { color: red; }

00:00:01.000 --> 00:00:02.000
Styled text
`;
  const result = vttToSrt(vtt);
  assert.ok(!result.includes("STYLE"), "STYLE block should be stripped");
  assert.ok(!result.includes("::cue"), "CSS rule should be stripped");
  assert.ok(result.includes("Styled text"), "cue text should be present");
});

test("vttToSrt: cue identifiers are skipped, text follows correctly", () => {
  const vtt = `WEBVTT

cue-1
00:00:01.000 --> 00:00:02.000
With identifier
`;
  const result = vttToSrt(vtt);
  assert.ok(!result.includes("cue-1"), "identifier should not appear in output");
  assert.ok(result.includes("With identifier"), "cue text should be present");
  assert.ok(result.includes("00:00:01,000 --> 00:00:02,000"), "timing should be correct");
});

test("vttToSrt: Windows CRLF line endings are normalized", () => {
  const vtt = "WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nCRLF text\r\n";
  const result = vttToSrt(vtt);
  assert.ok(result.includes("CRLF text"), "text should be present after CRLF normalization");
  assert.ok(result.includes("00:00:01,000 --> 00:00:02,000"), "timing should be correct");
});

test("vttToSrt: empty input produces empty string", () => {
  assert.equal(vttToSrt(""), "");
});

test("vttToSrt: position/alignment metadata on timing line is stripped", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000 align:left position:10%
Aligned text
`;
  const result = vttToSrt(vtt);
  const timingLine = result.split("\n").find((l) => l.includes("-->"));
  assert.ok(timingLine, "timing line not found");
  assert.equal(timingLine.trim(), "00:00:01,000 --> 00:00:02,000");
});

// ---------------------------------------------------------------------------
// normalizeTiming
// ---------------------------------------------------------------------------

test("normalizeTiming: dots replaced with commas", () => {
  const result = normalizeTiming("00:00:01.000 --> 00:00:02.000");
  assert.equal(result, "00:00:01,000 --> 00:00:02,000");
});

test("normalizeTiming: extra whitespace is normalized", () => {
  const result = normalizeTiming("00:00:01.000  -->  00:00:02.000");
  assert.equal(result, "00:00:01,000 --> 00:00:02,000");
});

test("normalizeTiming: position/alignment metadata stripped", () => {
  const result = normalizeTiming("00:00:01.000 --> 00:00:02.000 align:left position:10%");
  assert.equal(result, "00:00:01,000 --> 00:00:02,000");
});

// ---------------------------------------------------------------------------
// looksLikeVttPayload
// ---------------------------------------------------------------------------

test("looksLikeVttPayload: true for text starting with WEBVTT", () => {
  assert.ok(looksLikeVttPayload("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello"));
});

test("looksLikeVttPayload: true for text containing WEBVTT after newline", () => {
  assert.ok(looksLikeVttPayload("\nWEBVTT\n"));
});

test("looksLikeVttPayload: true for text with valid timestamp pattern", () => {
  assert.ok(looksLikeVttPayload("00:00:01.000 --> 00:00:02.000\nSome subtitle"));
});

test("looksLikeVttPayload: false for arbitrary text", () => {
  assert.equal(looksLikeVttPayload("Hello world, nothing here"), false);
});

// ---------------------------------------------------------------------------
// inferFormat
// ---------------------------------------------------------------------------

test("inferFormat: .vtt URL → vtt", () => {
  assert.equal(inferFormat("https://example.com/sub.vtt"), "vtt");
});

test("inferFormat: text/vtt content-type → vtt", () => {
  assert.equal(inferFormat("https://example.com/sub", "text/vtt"), "vtt");
});

test("inferFormat: .srt URL → srt", () => {
  assert.equal(inferFormat("https://example.com/sub.srt"), "srt");
});

test("inferFormat: subrip content-type → srt", () => {
  assert.equal(inferFormat("https://example.com/sub", "application/x-subrip"), "srt");
});

test("inferFormat: .ass URL → ass", () => {
  assert.equal(inferFormat("https://example.com/sub.ass"), "ass");
});

test("inferFormat: .ttml URL → ttml", () => {
  assert.equal(inferFormat("https://example.com/sub.ttml"), "ttml");
});

test("inferFormat: unknown URL and no content-type → unknown", () => {
  assert.equal(inferFormat("https://example.com/video.mp4"), "unknown");
});

// ---------------------------------------------------------------------------
// looksLikeSubtitle
// ---------------------------------------------------------------------------

test("looksLikeSubtitle: .vtt URL → true", () => {
  assert.ok(looksLikeSubtitle("https://example.com/sub.vtt"));
});

test("looksLikeSubtitle: .m3u8 URL → false", () => {
  assert.equal(looksLikeSubtitle("https://example.com/stream.m3u8"), false);
});

test("looksLikeSubtitle: text/vtt content-type → true", () => {
  assert.ok(looksLikeSubtitle("https://example.com/file", "text/vtt"));
});

test("looksLikeSubtitle: application/vnd.apple.mpegurl content-type → false", () => {
  assert.equal(looksLikeSubtitle("https://example.com/stream", "application/vnd.apple.mpegurl"), false);
});

test("looksLikeSubtitle: URL containing subtitle → true", () => {
  assert.ok(looksLikeSubtitle("https://example.com/subtitle/en.txt"));
});

test("looksLikeSubtitle: unrelated URL with no content-type → false", () => {
  assert.equal(looksLikeSubtitle("https://example.com/image.png"), false);
});

// ---------------------------------------------------------------------------
// subtitleCandidateScore
// ---------------------------------------------------------------------------

test("subtitleCandidateScore: vtt scores higher than srt", () => {
  const vtt = subtitleCandidateScore({ url: "https://example.com/sub.vtt", format: "vtt" });
  const srt = subtitleCandidateScore({ url: "https://example.com/sub.srt", format: "srt" });
  assert.ok(vtt > srt, `vtt score ${vtt} should exceed srt score ${srt}`);
});

test("subtitleCandidateScore: srt scores higher than unknown", () => {
  const srt = subtitleCandidateScore({ url: "https://example.com/sub.srt", format: "srt" });
  const unk = subtitleCandidateScore({ url: "https://example.com/sub", format: "unknown" });
  assert.ok(srt > unk, `srt score ${srt} should exceed unknown score ${unk}`);
});

test("subtitleCandidateScore: /subtitles/vi/ URL gets bonus", () => {
  const with_bonus = subtitleCandidateScore({ url: "https://example.com/subtitles/vi/en.vtt", format: "vtt" });
  const without = subtitleCandidateScore({ url: "https://example.com/sub.vtt", format: "vtt" });
  assert.ok(with_bonus > without, "subtitles/vi/ should add bonus");
});

test("subtitleCandidateScore: .vie.vtt URL gets bonus", () => {
  const with_bonus = subtitleCandidateScore({ url: "https://example.com/sub.vie.vtt", format: "vtt" });
  const without = subtitleCandidateScore({ url: "https://example.com/sub.vtt", format: "vtt" });
  assert.ok(with_bonus > without, ".vie.vtt should add bonus");
});

test("subtitleCandidateScore: vodcdn.fptplay.net host gets bonus", () => {
  const with_bonus = subtitleCandidateScore({ url: "https://vodcdn.fptplay.net/sub.vtt", format: "vtt" });
  const without = subtitleCandidateScore({ url: "https://example.com/sub.vtt", format: "vtt" });
  assert.ok(with_bonus > without, "vodcdn.fptplay.net should add bonus");
});

test("subtitleCandidateScore: URL containing vi gets bonus", () => {
  const with_bonus = subtitleCandidateScore({ url: "https://example.com/vi/sub.vtt", format: "vtt" });
  const without = subtitleCandidateScore({ url: "https://example.com/en/sub.vtt", format: "vtt" });
  assert.ok(with_bonus > without, "vi in URL should add bonus");
});
