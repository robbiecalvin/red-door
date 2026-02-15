# Obfuscation Reference

This document tracks the build obfuscation pipeline.

## Rules
- Source files under `frontend/src` and `backend/src` remain readable and editable.
- Obfuscation is applied only to compiled output in `dist/assets/*.js`.
- To regenerate obfuscated output: `npm run build:obfuscated`.

## Last Obfuscation Targets
- `dist/assets/index-Cl3gK9Xo.js`: 256543 bytes -> 724116 bytes
- `dist/assets/maplibre-gl-DsPq3vxX.js`: 944765 bytes -> 2535921 bytes

## Edit Workflow
1. Make code changes in source files.
2. Run `npm run build` (or `npm run build:obfuscated`).
3. For production artifact protection, run `npm run build:obfuscated`.
4. Never hand-edit files in `dist/`; they are generated.
