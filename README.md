# CrawlSub Extension

## Extension Functions

- Capture subtitle network responses from supported providers.
- Extract series, episode, and season context from the active page.
- Run single-episode subtitle crawl.
- Run full-season subtitle crawl by navigating provider episode lists.
- Skip previously completed subtitle URLs.
- Convert VTT subtitles to SRT.
- Save subtitles with normalized series and episode naming.
- Show crawl status and debug logs in the popup.

Supported providers:

- `tv360.vn`
- `fptplay.vn`

## Development Guide

### Requirements

- Node.js 18+
- pnpm

### Install

```bash
pnpm install
```

### Run Tests

```bash
pnpm test
```

### Build Manifests

```bash
pnpm run build:manifest:chrome
pnpm run build:manifest:firefox
```

Generated manifests are written to:

- `dist/chrome-mv3/manifest.json`
- `dist/firefox-mv2/manifest.json`

### Package Release Artifacts

```bash
pnpm run package:chrome
pnpm run package:firefox
pnpm run package:all
```

Release outputs:

- Chrome: `dist/crawlsub-chrome-mv3-v<version>.zip`
- Chrome: `dist/crawlsub-chrome-mv3-v<version>.crx` when `CRX_PRIVATE_KEY_PEM` is set
- Firefox: `dist/crawlsub-firefox-mv2-v<version>.xpi`

Packaging stage directories are cleaned up automatically after each package run.
