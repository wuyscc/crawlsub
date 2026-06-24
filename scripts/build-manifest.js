#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/build-manifest.js <chrome-mv3|firefox-mv2>");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const sourceMap = {
  "chrome-mv3": path.join(root, "config/manifests/manifest.chrome.mv3.json"),
  "firefox-mv2": path.join(root, "config/manifests/manifest.firefox.mv2.json")
};

const src = sourceMap[target];
if (!src || !fs.existsSync(src)) {
  console.error(`Unknown target: ${target}`);
  process.exit(1);
}

const distDir = path.join(root, "dist", target);
fs.mkdirSync(distDir, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(src, "utf8"));

const releaseVersion = (process.env.RELEASE_VERSION || "").replace(/^v/, "");
if (releaseVersion) manifest.version = releaseVersion;

if (target === "firefox-mv2") {
  const firefoxExtensionId = process.env.FIREFOX_EXTENSION_ID;
  if (firefoxExtensionId) {
    manifest.browser_specific_settings = manifest.browser_specific_settings || {};
    manifest.browser_specific_settings.gecko = manifest.browser_specific_settings.gecko || {};
    manifest.browser_specific_settings.gecko.id = firefoxExtensionId;
  }
}

fs.writeFileSync(path.join(distDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built manifest for ${target}: dist/${target}/manifest.json`);
