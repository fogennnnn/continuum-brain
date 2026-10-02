#!/bin/sh
# ContinuumBrain-v1 install: Node check only. Zero npm dependencies.
set -e
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed. Install Node.js 22+ first." >&2
  exit 1
fi
VER=$(node -p "process.versions.node")
MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$MAJOR" -lt 22 ]; then
  echo "ERROR: Node 22+ required (found $VER)." >&2
  exit 1
fi
echo "Node $VER OK (22+ required). No packages to install (zero dependencies)."
node src/demo.js > /dev/null && echo "smoke demo OK" || { echo "smoke demo FAILED"; exit 1; }
