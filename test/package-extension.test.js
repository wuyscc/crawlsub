const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildCrx3Args, buildArchiveName, cleanupStageDir } = require("../scripts/package-extension.js");

test("buildCrx3Args returns files array plus crx3 options", () => {
  const result = buildCrx3Args("/tmp/stage", "/tmp/stage/key.pem", "/tmp/dist/out.crx");

  assert.deepEqual(result, {
    files: ["/tmp/stage"],
    options: {
      keyPath: "/tmp/stage/key.pem",
      crxPath: "/tmp/dist/out.crx"
    }
  });
});

test("buildArchiveName uses .xpi for Firefox artifacts", () => {
  assert.equal(buildArchiveName("chrome-mv3", "0.1.0"), "crawlsub-chrome-mv3-v0.1.0.zip");
  assert.equal(buildArchiveName("firefox-mv2", "0.1.0"), "crawlsub-firefox-mv2-v0.1.0.xpi");
});

test("cleanupStageDir removes packaging stage directory", () => {
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "crawlsub-stage-"));
  fs.writeFileSync(path.join(stageDir, "marker.txt"), "ok");

  cleanupStageDir(stageDir);

  assert.equal(fs.existsSync(stageDir), false);
});
