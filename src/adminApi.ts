import { apiFetch } from "./client";
import type {Job} from './jobs';
import type {JobUpload} from './uploads';
export type AdminJob=Job & {user_id:string;internal_notes:string|null;customer_email:string};
export type AdminDetail={job:AdminJob;uploads:JobUpload[]};

export async function adminListJobs() {
  const res = await apiFetch("/api/v1/admin/jobs");
  return res.json() as Promise<{ jobs: AdminJob[] }>;
}

export async function adminGetJob(jobId: string) {
  const res = await apiFetch(`/api/v1/admin/jobs/${jobId}`);
  return res.json() as Promise<AdminDetail>;
}

export async function adminPatchJob(jobId: string, patch: { status?: string; internal_notes?: string }) {
  const res = await apiFetch(`/api/v1/admin/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  return res.json() as Promise<{ ok: boolean }>;
}
