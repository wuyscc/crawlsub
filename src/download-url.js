function createDownloadUrl(text, mimeType, runtime = globalThis) {
  const blob = new runtime.Blob([text], { type: mimeType });
  return runtime.URL.createObjectURL(blob);
}

function revokeDownloadUrl(url, runtime = globalThis) {
  if (!url || typeof url !== "string" || !url.startsWith("blob:")) return;
  runtime.URL.revokeObjectURL(url);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createDownloadUrl, revokeDownloadUrl };
}
