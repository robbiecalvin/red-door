#!/bin/bash
set -euo pipefail

echo "Installing dependencies..."
npm ci

echo "Running type checks..."
npm run typecheck

echo "Running tests..."
npm test

echo "Setup complete."
