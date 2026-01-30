import { apiFetch } from "./client";

export async function adminListJobs() {
  const res = await apiFetch("/api/v1/admin/jobs");
  return res.json() as Promise<{ jobs: any[] }>;
}

export async function adminGetJob(jobId: string) {
  const res = await apiFetch(`/api/v1/admin/jobs/${jobId}`);
  return res.json() as Promise<{ job: any; uploads: any[] }>;
}

export async function adminPatchJob(jobId: string, patch: { status?: string; internal_notes?: string }) {
  const res = await apiFetch(`/api/v1/admin/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  return res.json() as Promise<{ ok: boolean }>;
}
