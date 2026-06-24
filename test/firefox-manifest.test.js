const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Firefox MV2 manifest loads extension-api before background.js", () => {
  const manifestPath = path.join(__dirname, "..", "config", "manifests", "manifest.firefox.mv2.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.deepEqual(manifest.background?.scripts, ["src/extension-api.js", "src/download-url.js", "src/subtitle.js", "src/filename.js", "src/background.js"]);
});

test("Firefox MV2 manifest declares no data collection", () => {
  const manifestPath = path.join(__dirname, "..", "config", "manifests", "manifest.firefox.mv2.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.deepEqual(manifest.browser_specific_settings?.gecko?.data_collection_permissions, {
    required: ["none"]
  });
});

test("Firefox MV2 manifest template does not hard-code add-on ID", () => {
  const manifestPath = path.join(__dirname, "..", "config", "manifests", "manifest.firefox.mv2.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.equal(manifest.browser_specific_settings?.gecko?.id, undefined);
});
