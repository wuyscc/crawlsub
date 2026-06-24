const test = require("node:test");
const assert = require("node:assert/strict");

const { createExtensionApi } = require("../src/extension-api.js");

test("setBadge falls back to browserAction for Firefox-style APIs", () => {
  const calls = [];
  const api = createExtensionApi({
    browserAction: {
      setBadgeText(payload) {
        calls.push(["text", payload]);
      },
      setBadgeBackgroundColor(payload) {
        calls.push(["color", payload]);
      }
    },
    runtime: {},
    tabs: {},
    downloads: {},
    storage: { local: {} }
  });

  api.setBadge("running");

  assert.deepEqual(calls, [
    ["text", { text: "RUN" }],
    ["color", { color: "#d97706" }]
  ]);
});

test("queryTabs wraps callback-based chrome APIs in a promise", async () => {
  const expectedTabs = [{ id: 7, active: true }];
  const api = createExtensionApi({
    action: {
      setBadgeText() {},
      setBadgeBackgroundColor() {}
    },
    runtime: {},
    tabs: {
      query(queryInfo, callback) {
        assert.deepEqual(queryInfo, { active: true, currentWindow: true });
        callback(expectedTabs);
      }
    },
    downloads: {},
    storage: { local: {} }
  });

  const tabs = await api.queryTabs({ active: true, currentWindow: true });

  assert.deepEqual(tabs, expectedTabs);
});
