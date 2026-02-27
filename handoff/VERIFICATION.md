# Handoff Verification Checklist

## Pre-Run
- Ensure backend environment is configured.
- For non-production smoke validation only: set `DEV_DEBUG_AUTH_START_TOKEN=true`.

## Build Verification
- Backend compile: `npm.cmd run api:build`
- Full build: `npm.cmd run build`

## End-to-End Smoke Flow (PowerShell)
- `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- `./scripts/e2e-flow-smoke.ps1`

## Expected Smoke Output
- `tuneAnalyzeRejected: true`
- `runStatus: SUCCEEDED`
- `csvStatus: 200`

## Production Gate Checks
- Confirm LOG-only analyze enforcement behavior (see `PROD_CHECKLIST.md`).
- Confirm auth-boundary checks pass: `npm run test:auth-boundary`.
