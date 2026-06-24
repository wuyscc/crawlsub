(function initExtensionApi(globalScope) {
  function callbackToPromise(invoke) {
    return new Promise((resolve, reject) => {
      try {
        invoke((result) => {
          const lastError = globalScope.chrome?.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message || String(lastError)));
            return;
          }
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function createExtensionApi(chromeApi) {
    const apiRoot = chromeApi || {};
    const actionApi = apiRoot.action || apiRoot.browserAction || null;

    return {
      queryTabs(queryInfo) {
        return callbackToPromise((done) => apiRoot.tabs.query(queryInfo, done));
      },
      reloadTab(tabId) {
        return callbackToPromise((done) => apiRoot.tabs.reload(tabId, undefined, () => done()));
      },
      updateTab(tabId, updateProperties) {
        return callbackToPromise((done) => apiRoot.tabs.update(tabId, updateProperties, done));
      },
      getTab(tabId) {
        return callbackToPromise((done) => apiRoot.tabs.get(tabId, done));
      },
      sendTabMessage(tabId, message) {
        return callbackToPromise((done) => apiRoot.tabs.sendMessage(tabId, message, done));
      },
      download(options) {
        return callbackToPromise((done) => apiRoot.downloads.download(options, done));
      },
      storageGet(keys) {
        return callbackToPromise((done) => apiRoot.storage.local.get(keys, done));
      },
      storageSet(values) {
        return callbackToPromise((done) => apiRoot.storage.local.set(values, () => done()));
      },
      sendRuntimeMessage(message) {
        return callbackToPromise((done) => apiRoot.runtime.sendMessage(message, done));
      },
      setBadge(state) {
        if (!actionApi) return;
        if (state === "running") {
          actionApi.setBadgeText({ text: "RUN" });
          actionApi.setBadgeBackgroundColor({ color: "#d97706" });
          return;
        }
        if (state === "success") {
          actionApi.setBadgeText({ text: "OK" });
          actionApi.setBadgeBackgroundColor({ color: "#059669" });
          return;
        }
        if (state === "error") {
          actionApi.setBadgeText({ text: "ERR" });
          actionApi.setBadgeBackgroundColor({ color: "#dc2626" });
          return;
        }
        actionApi.setBadgeText({ text: "" });
      },
      notify(title, message) {
        try {
          apiRoot.notifications.create({
            type: "basic",
            iconUrl: "icons/icon128.png",
            title,
            message: String(message || "")
          });
        } catch {
          // best-effort only
        }
      },
      addTabUpdatedListener(fn) {
        apiRoot.tabs.onUpdated.addListener(fn);
      },
      removeTabUpdatedListener(fn) {
        apiRoot.tabs.onUpdated.removeListener(fn);
      }
    };
  }

  if (globalScope.chrome) {
    const extensionApi = createExtensionApi(globalScope.chrome);
    globalScope.extensionApi = extensionApi;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createExtensionApi };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
