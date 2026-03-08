#!/bin/bash
set -euo pipefail

echo "Running unit tests..."
npm test

echo "Running type checks..."
npm run typecheck
