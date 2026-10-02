#!/bin/sh
# One-command rebuild: verify Node, run full gates, run demo.
set -e
node --version
npm run gates
npm run demo
echo "rebuild complete."
