#!/usr/bin/env bash
set -euo pipefail

WORK_DIR="${WORK_DIR:-/tmp/materialize-dev-server}"
TERMINAL_USER="${TERMINAL_USER:-materialize-user}"
TERMINAL_GROUP="${TERMINAL_GROUP:-$TERMINAL_USER}"
SENSITIVE_PATHS=("/app" "/root")

if ! id "${TERMINAL_USER}" >/dev/null 2>&1; then
  useradd --system --shell /bin/bash --home-dir "${WORK_DIR}" "${TERMINAL_USER}"
fi

mkdir -p "${WORK_DIR}"
chown -R "${TERMINAL_USER}:${TERMINAL_GROUP}" "${WORK_DIR}"
chmod 770 "${WORK_DIR}"

NPM_CACHE="${WORK_DIR}/.npm-cache"
mkdir -p "${NPM_CACHE}"
chown -R "${TERMINAL_USER}:${TERMINAL_GROUP}" "${NPM_CACHE}"
chmod 770 "${NPM_CACHE}"

BUN_CACHE="${WORK_DIR}/.bun-cache"
mkdir -p "${BUN_CACHE}"
chown -R "${TERMINAL_USER}:${TERMINAL_GROUP}" "${BUN_CACHE}"
chmod 770 "${BUN_CACHE}"

if command -v setfacl >/dev/null 2>&1; then
  setfacl -m "u:${TERMINAL_USER}:rwx" "${WORK_DIR}" || true
  setfacl -d -m "u:${TERMINAL_USER}:rwx" "${WORK_DIR}" || true
  setfacl -d -m "o::---" "${WORK_DIR}" || true
fi

for path in "${SENSITIVE_PATHS[@]}"; do
  if [ -d "${path}" ]; then
    chmod 700 "${path}" || true
    if command -v setfacl >/dev/null 2>&1; then
      setfacl -m "u:${TERMINAL_USER}:0" "${path}" || true
    fi
  fi
done

exec "$@"
