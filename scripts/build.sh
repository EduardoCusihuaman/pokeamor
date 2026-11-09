#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist_root="$project_root/dist"
python "$project_root/scripts/build-worker.py"
python "$project_root/scripts/validate-card-resources.py"

rm -rf "$dist_root"
mkdir -p "$dist_root/server" "$dist_root/.openai"
cp "$project_root/worker/index.js" "$dist_root/server/index.js"
cp "$project_root/.openai/hosting.json" "$dist_root/.openai/hosting.json"

echo "Built $dist_root"

node "$project_root/scripts/validate-catalog-artifact.mjs"
