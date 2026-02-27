# Handoff Index

## Handoff Package
- Summary: `handoff/SUMMARY.md`
- Verification checklist: `handoff/VERIFICATION.md`
- Recommended next steps: `handoff/NEXT_STEPS.md`

## Core Project Docs
- Project overview: `README.md`
- Production readiness: `PROD_CHECKLIST.md`
- Release notes: `RELEASE_NOTES.md`
- API contract: `openapi.yaml`

## Primary Validation Commands
- Backend compile: `npm.cmd run api:build`
- Full build: `npm.cmd run build`
- End-to-end smoke flow (PowerShell):
  - `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
  - `./scripts/e2e-flow-smoke.ps1`
- Auth boundary smoke:
  - `npm run test:auth-boundary`
