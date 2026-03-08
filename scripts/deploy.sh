#!/bin/bash
set -euo pipefail

echo "Syncing GitHub Pages artifacts..."
npm run build:pages

echo "Deployment complete."
