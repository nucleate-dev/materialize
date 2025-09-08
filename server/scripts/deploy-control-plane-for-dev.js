// /server/scripts/deploy-control-plane.js
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const KEY_PATH = process.env.KEY_PATH || "mat-ec2-key-1.pem";
const USER = process.env.USERNAME_ON_EC2 || "ec2-user";
const HOST =
  process.env.HOST || "ec2-18-218-177-75.us-east-2.compute.amazonaws.com";

const localBase = path.resolve("control-plane");
const localZip = "control-plane.zip";
const remoteHome = `/home/${USER}`;
const remoteZip = `${remoteHome}/control-plane.zip`;
const remoteBase = `${remoteHome}/control-plane`;

const CW_CONFIG_PATH =
  "/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json";
const CW_LOG_FILE = `${remoteBase}/dev-server.log`;
const CW_LOG_GROUP = "/ec2/materialize/control-plane-dev";

const args = process.argv.slice(2);

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: "/bin/bash" });
}

function sq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function runRemoteBash(script) {
  const cmd = `ssh -i "${KEY_PATH}" ${USER}@${HOST} "bash -lc ${sq(script)}"`;
  run(cmd);
}

function ensureRemotePrereqs() {
  // 1. Install deps + create folder
  const preScript = `
    set -euxo pipefail

    if command -v dnf >/dev/null 2>&1; then
      if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
        sudo dnf install -y nodejs gcc-c++ make
      fi
      command -v unzip >/dev/null 2>&1 || sudo dnf install -y unzip
      sudo dnf install -y amazon-cloudwatch-agent
    else
      if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
        sudo yum install -y nodejs gcc-c++ make
      fi
      command -v unzip >/dev/null 2>&1 || sudo yum install -y unzip
      sudo yum install -y amazon-cloudwatch-agent
    fi

    mkdir -p ${remoteBase}
    echo "✅ Remote prerequisites OK"
  `;
  runRemoteBash(preScript);

  // 2. Check if config is missing
  const checkAgent = `
    if ! pgrep -f amazon-cloudwatch-agent >/dev/null 2>&1 || ! grep -q "${CW_LOG_GROUP}" "${CW_CONFIG_PATH}" 2>/dev/null; then
      exit 42  # force next step
    fi
  `;
  try {
    runRemoteBash(checkAgent);
    console.log("✅ CloudWatch Agent already running with correct config");
  } catch (err) {
    if (err.status === 42 || err.message.includes("Command failed")) {
      console.log("🔧 Writing CloudWatch Agent config...");
    } else {
      throw err;
    }

    // 3. Upload config safely
    run(`ssh -i "${KEY_PATH}" ${USER}@${HOST} 'sudo bash -c "cat > ${CW_CONFIG_PATH}"' <<EOCONFIG
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "${CW_LOG_FILE}",
            "log_group_name": "${CW_LOG_GROUP}",
            "log_stream_name": "{instance_id}-dev-server",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          }
        ]
      }
    },
    "force_flush_interval": 5
  }
}
EOCONFIG`);

    // 4. Restart the agent
    runRemoteBash(`
      sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \\
        -a fetch-config \\
        -m ec2 \\
        -c file:${CW_CONFIG_PATH} \\
        -s
      echo "✅ CloudWatch Agent configured and started"
    `);
  }
}

function fullDeploy() {
  console.log("==> Full deploy: zipping control-plane CONTENTS...");
  if (!fs.existsSync(localBase)) {
    console.error(`❌ Not found: ${localBase}`);
    process.exit(1);
  }

  run(
    `bash -lc 'cd ${sq(localBase).slice(1, -1)} && zip -r ${sq(
      path.resolve(localZip)
    ).slice(
      1,
      -1
    )} . -x "node_modules/*" -x "*/node_modules/*" -x "dist/*" -x "*/dist/*"'`
  );

  console.log("==> Copying zip to EC2...");
  run(`scp -i "${KEY_PATH}" ${localZip} ${USER}@${HOST}:${remoteZip}`);

  console.log("==> Unzipping remotely & installing dependencies...");
  const script = `
    set -euxo pipefail
    mkdir -p ${remoteBase}
    unzip -o ${remoteZip} -d ${remoteBase}
    rm -f ${remoteZip}
    cd ${remoteBase}
    if [ -f package.json ]; then
      unset NODE_ENV
      npm_config_production=false npm ci || (unset NODE_ENV; npm_config_production=false npm install)
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
        .filter((d) => d && d !== ".")
    )
  );
  if (parentDirs.length) {
    const mkdirs = parentDirs
      .map((d) => `mkdir -p ${path.posix.join(remoteBase, d)}`)
      .join(" && ");
    runRemoteBash(
      `set -euxo pipefail; ${mkdirs}; echo "✅ Remote directories ensured"`
    );
  } else {
    runRemoteBash(
      `set -euxo pipefail; mkdir -p ${remoteBase}; echo "✅ Remote base ensured"`
    );
  }

  for (const { abs, rel } of items) {
    const parent = path.posix.dirname(rel);
    const remoteDir =
      parent === "." ? remoteBase : path.posix.join(remoteBase, parent);
    const isDir = fs.lstatSync(abs).isDirectory();
    const flag = isDir ? "-r" : "";
    run(
      `scp -i "${KEY_PATH}" ${flag} "${abs}" ${USER}@${HOST}:"${remoteDir}/"`
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
        npm_config_production=false npm ci || (unset NODE_ENV; npm_config_production=false npm install)
      else
        npm_config_production=false npm install
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
    ensureRemotePrereqs();
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
