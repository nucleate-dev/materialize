// /server/scripts/deploy-control-plane.js
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const KEY_PATH = "mat-ec2-key-1.pem";
const USER = "ec2-user";
const HOST = "ec2-18-222-193-132.us-east-2.compute.amazonaws.com";
const SSH_OPTS = "-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=~/.ssh/known_hosts";

const localBase = path.resolve("control-plane");
const localZip = "control-plane.zip";
const remoteHome = `/home/${USER}`;
const remoteZip = `${remoteHome}/control-plane.zip`;
const remoteBase = `${remoteHome}/control-plane`;

const args = process.argv.slice(2);

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: "/bin/bash" });
}

function sq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function runRemoteBash(script) {
  const cmd = `ssh ${SSH_OPTS} -i "${KEY_PATH}" ${USER}@${HOST} "bash -lc ${sq(script)}"`;
  run(cmd);
}

function ensureRemoteReady() {
  // Ensure remote base directory exists (in case user data script didn't run)
  const script = `
    set -euxo pipefail
    mkdir -p ${remoteBase}
    echo "✅ Remote directory ready"
  `;
  runRemoteBash(script);
}

function fullDeploy() {
  console.log("==> Full deploy: zipping control-plane CONTENTS...");
  if (!fs.existsSync(localBase)) {
    console.error(`❌ Not found: ${localBase}`);
    process.exit(1);
  }

  run(
    `bash -lc 'cd ${sq(localBase).slice(1, -1)} && zip -r ${sq(
      path.resolve(localZip),
    ).slice(
      1,
      -1,
    )} . -x "node_modules/*" -x "*/node_modules/*" -x "dist/*" -x "*/dist/*" -x "control-plane-dist.zip"'`,
  );

  console.log("==> Copying zip to EC2...");
  run(`scp ${SSH_OPTS} -i "${KEY_PATH}" ${localZip} ${USER}@${HOST}:${remoteZip}`);

  console.log("==> Unzipping remotely & installing dependencies...");
  const script = `
    set -euxo pipefail
    mkdir -p ${remoteBase}
    unzip -o ${remoteZip} -d ${remoteBase}
    rm -f ${remoteZip}
    cd ${remoteBase}
    if [ -f package.json ]; then
      unset NODE_ENV
      npm_config_production=false npm install --no-audit --no-fund || (unset NODE_ENV; npm_config_production=false npm install --no-audit --no-fund)
      if ! npx --yes tsx --version >/dev/null 2>&1; then npm install -D tsx; fi
      if ! npx --yes nodemon --version >/dev/null 2>&1; then npm install -D nodemon ts-node; fi
    fi
    echo "✅ Full deploy complete"
  `;
  runRemoteBash(script);

  console.log("==> Cleaning local zip...");
  try {
    fs.unlinkSync(localZip);
  } catch {}
}

function selectiveDeploy(paths) {
  console.log("==> Selective deploy: copying specific files/dirs…");

  const items = paths.map((p) => {
    const normalized = p.replace(/^control-plane[\\/]/, "");
    const abs = path.isAbsolute(normalized)
      ? normalized
      : path.join(localBase, normalized);
    const rel = path.relative(localBase, abs);
    if (!rel || rel.startsWith("..")) {
      console.error(`❌ Path must be inside ${localBase}: ${p}`);
      process.exit(1);
    }
    if (!fs.existsSync(abs)) {
      console.error(`❌ Not found: ${abs}`);
      process.exit(1);
    }
    return { abs, rel };
  });

  const parentDirs = Array.from(
    new Set(
      items
        .map(({ rel }) => path.posix.dirname(rel))
        .filter((d) => d && d !== "."),
    ),
  );
  if (parentDirs.length) {
    const mkdirs = parentDirs
      .map((d) => `mkdir -p ${path.posix.join(remoteBase, d)}`)
      .join(" && ");
    runRemoteBash(
      `set -euxo pipefail; ${mkdirs}; echo "✅ Remote directories ensured"`,
    );
  } else {
    runRemoteBash(
      `set -euxo pipefail; mkdir -p ${remoteBase}; echo "✅ Remote base ensured"`,
    );
  }

  for (const { abs, rel } of items) {
    const parent = path.posix.dirname(rel);
    const remoteDir =
      parent === "." ? remoteBase : path.posix.join(remoteBase, parent);
    const isDir = fs.lstatSync(abs).isDirectory();
    const flag = isDir ? "-r" : "";
    run(
      `scp ${SSH_OPTS} -i "${KEY_PATH}" ${flag} "${abs}" ${USER}@${HOST}:"${remoteDir}/"`,
    );
  }

  const packageJsonIncluded = items.some(({ rel }) => rel === "package.json");
  const postScript = packageJsonIncluded
    ? `
    set -euxo pipefail
    cd ${remoteBase}
    if [ -f package.json ]; then
      unset NODE_ENV
      if [ -f package-lock.json ]; then
        npm_config_production=false npm install --no-audit --no-fund || (unset NODE_ENV; npm_config_production=false npm install --no-audit --no-fund)
      else
        npm_config_production=false npm install --no-audit --no-fund
      fi
      if ! npx --yes tsx --version >/dev/null 2>&1; then npm install -D tsx; fi
      if ! npx --yes nodemon --version >/dev/null 2>&1; then npm install -D nodemon ts-node; fi
    fi
    echo "✅ Selective deploy complete"
  `
    : `echo "✅ Selective deploy complete - skipped npm install since package.json not included"`;

  runRemoteBash(postScript);
}

(function main() {
  try {
    ensureRemoteReady();
    if (args.length === 0) {
      fullDeploy();
    } else {
      selectiveDeploy(args);
    }
    console.log("✅ Done. All SSH sessions exited.");
  } catch (err) {
    console.error("❌ Deployment failed:", err?.message || err);
    process.exit(1);
  }
})();
