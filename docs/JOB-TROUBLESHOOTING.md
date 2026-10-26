# Troubleshooting cases attached to jobs

## Customer workflow

1. Prepare a case in **Troubleshoot** on the website or in Windows Studio **0.28**.
2. Save the case as DD84 troubleshooting JSON. Keep the original tune and log files.
3. Open **My jobs**, choose the matching vehicle/job, then find **Troubleshooting cases**.
4. Choose the saved JSON. Review its vehicle, tune/log relationship, evidence and unresolved items. Selecting a file alone does not upload it.
5. Confirm that the case belongs to this job, then select **Attach case to this job**.
6. Open a saved snapshot from the history or download it to reopen in Studio. Edit a local copy and attach it again to add a later snapshot; earlier snapshots remain unchanged through the API.

A case can record missing information or concerns. Attachment is not a passing diagnosis, calibration approval, analysis run, tune release or training-data acceptance. Original tunes/logs need separate uploads. The highest checklist status remains **Prepared for human review**.

Failed attachment requests retain the selected case and its submission ID for retry while the page stays open. Duplicate clicks and retries with that ID do not create additional snapshots. Choosing the file again or reopening the page starts a new submission. History shows 20 snapshots at a time with **Load older cases**.

## Shop workflow

At `/admin`, select a job and open its case history. This view is read-only for the submitted evidence. Download a snapshot when a local copy is useful. No new email notification is sent for case attachment.

Internal notes use **Save internal notes**. Changing status does not save or erase the notes draft. Switching jobs with unsaved notes offers **Keep editing notes** or **Discard draft and open job**. Save notes before navigating to another page; the browser also warns before reload/close. Internal notes are omitted from customer job API responses.

## Storage and access

- Migration `007_troubleshooting_cases.sql` creates the table and job/date index. Existing migrations are unchanged. The normal backend startup applies it transactionally.
- Authenticated customers can create/list/read snapshots only for their own jobs. Admins can list/read other customer jobs through the admin routes, but cannot submit evidence as the customer.
- Routes: `GET/POST /api/v1/jobs/:jobId/troubleshooting-cases`, `GET /api/v1/jobs/:jobId/troubleshooting-cases/:caseId`, and the two read-only equivalents under `/api/v1/admin/jobs/`.
- POST requires `{requestId: UUID, report: DD84_TROUBLESHOOTING_CASE_V1}`. Imported reports are limited to 128 KiB and the shared catalog's field/check limits. Untrusted derived assessments and source links are discarded and recomputed on the server. Unsupported schemas/catalog versions fail explicitly.
- A unique `(job_id, request_id)` constraint handles concurrent retries. Reusing an ID for different normalized evidence returns 409. Reads set `Cache-Control: no-store`.
- SQL history cursors retain timestamp microseconds and use IDs to break ties. A cursor or case from another job cannot be used to access its evidence.
- RLS is enabled with no direct browser/PostgREST policy. The backend migration/runtime role must own the table or have its intended server access. No credentials are shipped to the frontend.
- SHA-256 covers the normalized report encoded as compact JSON with recursively sorted object keys, preserved array order, and UTF-8. It survives PostgreSQL jsonb key reordering. It identifies content, not the truth of an operator statement or a vehicle identity; it is not the hash of a pretty-printed download's raw bytes.
- There is no update/delete endpoint. Normal database administration and parent-job deletion remain possible; this is not a tamper-proof archive.

The canonical catalog remains `products/dd84-desktop/troubleshooting.mjs`. Its exact backend mirror is checked by the browser regression suite; refresh it with `node scripts/sync-troubleshooting.mjs`. Keeping a copy in `backend/shared` supports the existing Render backend build root. A future catalog version requires an explicit historical reader/migration strategy.

## Verification

Local checks: 153 backend tests, 207 desktop tests, 16 browser workflow groups, frontend/backend builds, connection-screen regression, eight audit-reporter tests, and production dependency audits. Browser cases use synthetic API fixtures, including retry/duplicate-click behavior, download round trips, pagination, invalid files, mobile layout, stale job responses, read-only admin evidence and explicit notes saves.

The pipeline additionally exercises real PostgreSQL: migrations, concurrent idempotent submissions, owner/admin boundaries, exact-job case/cursor association, malformed/oversized inputs, fingerprint round trips, timestamp ties, no analysis/release side effects and internal-note privacy/preservation. CI runs the C-dependent capture and firmware checks that require a compiler absent from this Windows development computer.

No desktop runtime or installer change is required; the existing 0.28 JSON format is compatible. This milestone does not add native proprietary file decoders, controller definitions, autonomous calibration or vehicle flashing.
