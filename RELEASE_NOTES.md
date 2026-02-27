# Release Notes

## 2026-02-27 — LOG Upload Enforcement + Flow Hardening

### Summary
Improved upload/analyze correctness and user guidance across frontend, backend, smoke tests, and documentation.

### Shipped
- Frontend upload flow hardening:
  - Fixed multipart upload behavior by avoiding forced JSON content type for `FormData` requests.
  - Added upload kind selection (`LOG` / `TUNE`) in job dashboard.
  - Added upload selection UX (checkboxes, select/clear all toggle, selected count).
  - Analyze now uses selected `LOG` uploads only.
  - Non-`LOG` uploads are visible, annotated as not analyzable, and non-selectable.
- Backend enforcement:
  - `POST /api/v1/jobs/:jobId/analyze` now validates `logUploadIds` as:
    - user-owned,
    - attached to the target job,
    - `kind === LOG`.
  - Invalid `logUploadIds` return `400 BAD_REQUEST` with field details (LOG-only analyze enforcement).
- End-to-end smoke flow expansion:
  - `scripts/e2e-flow-smoke.ps1` now uploads one `LOG` + one `TUNE`,
  - asserts `TUNE` analyze rejection (`400`),
  - then verifies successful `LOG` analyze and end-to-end exports.
- Documentation updates:
  - `README.md` quick flow now includes upload-first step and LOG-only analyze requirement.
  - `openapi.yaml` analyze endpoint/request descriptions updated for job-scoped LOG IDs.
  - `PROD_CHECKLIST.md` includes explicit LOG/TUNE enforcement verification and expected smoke output.

### Validation
- Build checks passed:
  - `npm.cmd run api:build`
  - `npm.cmd run build`
- Smoke flow passed with expected key outputs:
  - `tuneAnalyzeRejected: true`
  - `runStatus: SUCCEEDED`
  - `csvStatus: 200`

### Notes
- End-to-end smoke flow requires backend started with `DEV_DEBUG_AUTH_START_TOKEN=true` in non-production environments only.
