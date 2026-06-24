#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error("Usage: node scripts/package-extension.js <chrome-mv3|firefox-mv2>");

  const root = path.resolve(__dirname, "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const version = (process.env.RELEASE_VERSION || "").replace(/^v/, "") || pkg.version;

  const stageDir = path.join(root, "dist", `${target}-stage`);
  const outDir = path.join(root, "dist");
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  try {
    const copyList = ["icons", "popup", "src", "manifest.json", "README.md"];
    for (const item of copyList) {
      const from = item === "manifest.json" ? path.join(root, "dist", target, "manifest.json") : path.join(root, item);
      const to = path.join(stageDir, item);
      if (!fs.existsSync(from)) continue;
      const stat = fs.statSync(from);
      if (stat.isDirectory()) {
        fs.cpSync(from, to, { recursive: true });
      } else {
        fs.copyFileSync(from, to);
      }
    }

    const archiveName = buildArchiveName(target, version);
    execSync(`zip -r "${path.join(outDir, archiveName)}" .`, { cwd: stageDir, stdio: "inherit" });

    if (target === "chrome-mv3") {
        const keyPem = process.env.CRX_PRIVATE_KEY_PEM || "";
        if (keyPem) {
          const keyPath = path.join(stageDir, "key.pem");
          const crxName = `crawlsub-${target}-v${version}.crx`;
          const crxPath = path.join(outDir, crxName);
          fs.writeFileSync(keyPath, keyPem);
          const crx3 = require("crx3");
          const { files, options } = buildCrx3Args(stageDir, keyPath, crxPath);
          await crx3(files, options);
          fs.rmSync(keyPath, { force: true });
          console.log(`Created ${crxName}`);
      } else {
        console.warn("CRX_PRIVATE_KEY_PEM is not set; skipping .crx generation");
      }
    }
  } finally {
    cleanupStageDir(stageDir);
  }
}

function buildCrx3Args(stageDir, keyPath, crxPath) {
  return {
    files: [stageDir],
    options: {
      keyPath,
      crxPath
    }
  };
}

function buildArchiveName(target, version) {
  const ext = target === "firefox-mv2" ? "xpi" : "zip";
  return `crawlsub-${target}-v${version}.${ext}`;
}

function cleanupStageDir(stageDir) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { buildCrx3Args, buildArchiveName, cleanupStageDir };
