const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createDownloadUrl } = require("../src/download-url.js");

test("createDownloadUrl uses a blob URL instead of a data URL", () => {
  const calls = [];
  const runtime = {
    Blob,
    URL: {
      createObjectURL(blob) {
        calls.push(blob);
        return "blob:generated-url";
      }
    }
  };

  const url = createDownloadUrl("hello", "text/plain;charset=utf-8", runtime);

  assert.equal(url, "blob:generated-url");
  assert.equal(calls.length, 1);
  assert.equal(calls[0] instanceof Blob, true);
});

test("download-url exposes helpers on globalThis for classic-script loading", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "download-url.js"), "utf8");
  const context = {
    Blob,
    URL,
    globalThis: {}
  };
  context.globalThis = context;

  vm.runInNewContext(source, context);

  assert.equal(typeof context.createDownloadUrl, "function");
  assert.equal(typeof context.revokeDownloadUrl, "function");
});
