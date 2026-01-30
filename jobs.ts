import { apiGet, apiPost } from "./client";

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

export async function analyzeJob(jobId: string, logUploadIds: string[]) {
  return apiPost<{ runId: string; status: string }>(`/api/v1/jobs/${jobId}/analyze`, { logUploadIds });
}
