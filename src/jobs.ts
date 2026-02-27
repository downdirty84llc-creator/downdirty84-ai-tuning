import { apiFetch, apiGet, apiPost } from "./client";

export type Job = {
  id: string;
  service_type: string;
  platform: string;
  engine_family: string | null;
  vehicle: string | null;
  ecu: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export async function createJob(input: {
  serviceType: string;
  platform: string;
  engineFamily?: string;
  vehicle?: string;
  ecu?: string;
  notes?: string;
}) {
  return apiPost<{ job: Job }>("/api/v1/jobs", input);
}

export async function listJobs() {
  return apiGet<{ jobs: Job[] }>("/api/v1/jobs");
}

export async function getJob(jobId: string) {
  return apiGet<{ job: Job }>(`/api/v1/jobs/${jobId}`);
}

export async function analyzeJob(jobId: string, logUploadIds: string[]) {
  return apiPost<{ runId: string; status: string }>(`/api/v1/jobs/${jobId}/analyze`, { logUploadIds });
}

export type RunStatus = {
  runId: string;
  status: string;
  progress?: { pct: number; stage: string };
  startedAt?: string | null;
  finishedAt?: string | null;
  errors?: string[];
};

export type DiffSetSummary = {
  diffSetId: string;
  runId: string;
  name?: string;
  source?: string | null;
  createdAt?: string | null;
  itemCounts?: {
    total: number;
    approved: number;
    suggested: number;
    rejected: number;
  };
};

export async function getRunStatus(runId: string) {
  return apiGet<RunStatus>(`/api/v1/runs/${runId}`);
}

export async function getLatestRun(jobId: string) {
  return apiGet<RunStatus>(`/api/v1/jobs/${jobId}/runs/latest`);
}

export async function listRuns(jobId: string) {
  return apiGet<{ runs: RunStatus[] }>(`/api/v1/jobs/${jobId}/runs`);
}

export async function getValidation(jobId: string, runId?: string | null) {
  const qp = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return apiGet<unknown>(`/api/v1/jobs/${jobId}/validation${qp}`);
}

export async function getFindings(jobId: string, runId?: string | null) {
  const qp = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return apiGet<unknown>(`/api/v1/jobs/${jobId}/findings${qp}`);
}

export async function generateDiffset(jobId: string, runId: string) {
  return apiPost<{ diffSetId: string }>(`/api/v1/jobs/${jobId}/diffsets/generate`, {
    runId,
    generator: "GM_LS_MAF_V1",
    options: { mode: "AUTO" }
  });
}

export async function listDiffsets(jobId: string, runId?: string | null) {
  const qp = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return apiGet<DiffSetSummary[]>(`/api/v1/jobs/${jobId}/diffsets${qp}`);
}

export async function exportSummary(diffSetId: string) {
  return apiPost<{ text: string }>(`/api/v1/diffsets/${diffSetId}/export/summary`, {});
}

export async function exportCsv(diffSetId: string) {
  const res = await apiFetch(`/api/v1/diffsets/${diffSetId}/export/csv`, {
    method: "POST",
    body: JSON.stringify({ includeSuggested: false, minConfidence: 0.45 })
  });
  return res.text();
}
