const baseUrl = process.env.BASE_URL || "http://localhost:8080";

const ownerCookie = process.env.OWNER_COOKIE || "";
const intruderCookie = process.env.INTRUDER_COOKIE || "";

const ownerRunId = process.env.OWNER_RUN_ID || "";
const ownerDiffSetId = process.env.OWNER_DIFFSET_ID || "";
const ownerJobId = process.env.OWNER_JOB_ID || "";

if (!ownerCookie || !intruderCookie || !ownerRunId || !ownerDiffSetId) {
  console.error("Missing required env vars.");
  console.error("Required: OWNER_COOKIE, INTRUDER_COOKIE, OWNER_RUN_ID, OWNER_DIFFSET_ID");
  console.error("Optional: BASE_URL (default http://localhost:8080)");
  process.exit(1);
}

async function request(path, cookie) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Cookie: cookie
    }
  });
  return res;
}

async function requestPost(path, cookie, body = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify(body)
  });
  return res;
}

function assertStatus(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got HTTP ${actual}`);
  }
  console.log(`✔ ${label}: HTTP ${actual}`);
}

async function run() {
  console.log(`Running auth-boundary smoke checks against ${baseUrl}`);

  // Owner should be able to read own run
  const ownerRun = await request(`/api/v1/runs/${ownerRunId}`, ownerCookie);
  assertStatus(ownerRun.status, 200, "Owner run access");

  // Intruder should not be able to read owner's run
  const intruderRun = await request(`/api/v1/runs/${ownerRunId}`, intruderCookie);
  assertStatus(intruderRun.status, 404, "Intruder run access blocked");

  // Owner should be able to read own diffset
  const ownerDiff = await request(`/api/v1/diffsets/${ownerDiffSetId}`, ownerCookie);
  assertStatus(ownerDiff.status, 200, "Owner diffset access");

  // Intruder should not be able to read owner's diffset
  const intruderDiff = await request(`/api/v1/diffsets/${ownerDiffSetId}`, intruderCookie);
  assertStatus(intruderDiff.status, 404, "Intruder diffset access blocked");

  // Owner should be able to export summary
  const ownerSummary = await requestPost(`/api/v1/diffsets/${ownerDiffSetId}/export/summary`, ownerCookie, {});
  assertStatus(ownerSummary.status, 200, "Owner summary export");

  // Intruder should not be able to export summary
  const intruderSummary = await requestPost(`/api/v1/diffsets/${ownerDiffSetId}/export/summary`, intruderCookie, {});
  assertStatus(intruderSummary.status, 404, "Intruder summary export blocked");

  // Owner should be able to export CSV
  const ownerCsv = await requestPost(`/api/v1/diffsets/${ownerDiffSetId}/export/csv`, ownerCookie, {
    includeSuggested: false,
    minConfidence: 0.45
  });
  assertStatus(ownerCsv.status, 200, "Owner CSV export");

  // Intruder should not be able to export CSV
  const intruderCsv = await requestPost(`/api/v1/diffsets/${ownerDiffSetId}/export/csv`, intruderCookie, {
    includeSuggested: false,
    minConfidence: 0.45
  });
  assertStatus(intruderCsv.status, 404, "Intruder CSV export blocked");

  if (ownerJobId) {
    // Owner should be able to list runs for own job
    const ownerRuns = await request(`/api/v1/jobs/${ownerJobId}/runs`, ownerCookie);
    assertStatus(ownerRuns.status, 200, "Owner job runs list");

    // Intruder should not be able to list owner's job runs
    const intruderRuns = await request(`/api/v1/jobs/${ownerJobId}/runs`, intruderCookie);
    assertStatus(intruderRuns.status, 404, "Intruder job runs list blocked");

    // Owner should be able to fetch latest run for own job
    const ownerLatestRun = await request(`/api/v1/jobs/${ownerJobId}/runs/latest`, ownerCookie);
    assertStatus(ownerLatestRun.status, 200, "Owner latest run access");

    // Intruder should not be able to fetch latest run for owner's job
    const intruderLatestRun = await request(`/api/v1/jobs/${ownerJobId}/runs/latest`, intruderCookie);
    assertStatus(intruderLatestRun.status, 404, "Intruder latest run access blocked");

    // Owner should be able to list diffsets for own job/run
    const ownerJobDiffsets = await request(`/api/v1/jobs/${ownerJobId}/diffsets?runId=${encodeURIComponent(ownerRunId)}`, ownerCookie);
    assertStatus(ownerJobDiffsets.status, 200, "Owner job diffsets list");

    // Owner should be able to read validation/findings for own job/run
    const ownerValidation = await request(`/api/v1/jobs/${ownerJobId}/validation?runId=${encodeURIComponent(ownerRunId)}`, ownerCookie);
    assertStatus(ownerValidation.status, 200, "Owner validation access");
    const ownerFindings = await request(`/api/v1/jobs/${ownerJobId}/findings?runId=${encodeURIComponent(ownerRunId)}`, ownerCookie);
    assertStatus(ownerFindings.status, 200, "Owner findings access");

    // Intruder should not be able to list diffsets for owner's job/run
    const intruderJobDiffsets = await request(`/api/v1/jobs/${ownerJobId}/diffsets?runId=${encodeURIComponent(ownerRunId)}`, intruderCookie);
    assertStatus(intruderJobDiffsets.status, 404, "Intruder job diffsets list blocked");

    // Intruder should not be able to read validation/findings for owner's job/run
    const intruderValidation = await request(`/api/v1/jobs/${ownerJobId}/validation?runId=${encodeURIComponent(ownerRunId)}`, intruderCookie);
    assertStatus(intruderValidation.status, 404, "Intruder validation access blocked");
    const intruderFindings = await request(`/api/v1/jobs/${ownerJobId}/findings?runId=${encodeURIComponent(ownerRunId)}`, intruderCookie);
    assertStatus(intruderFindings.status, 404, "Intruder findings access blocked");

    // Intruder should not be able to generate diffset for owner's job/run
    const intruderGenerate = await requestPost(`/api/v1/jobs/${ownerJobId}/diffsets/generate`, intruderCookie, {
      runId: ownerRunId,
      generator: "GM_LS_MAF_V1",
      options: { mode: "AUTO" }
    });
    assertStatus(intruderGenerate.status, 404, "Intruder diffset generation blocked");
  } else {
    console.log("ℹ Skipping job-scoped checks (OWNER_JOB_ID not set).");
  }

  console.log("\nAll auth-boundary smoke checks passed.");
}

run().catch((err) => {
  console.error("\nAuth-boundary smoke checks failed.");
  console.error(err.message || err);
  process.exit(1);
});
