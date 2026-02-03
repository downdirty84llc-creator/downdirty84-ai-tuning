import { apiFetch } from "./client";

export async function uploadFile(opts: { file: File; jobId: string; kind?: string }) {
  const form = new FormData();
  form.append("file", opts.file);
  form.append("jobId", opts.jobId);
  form.append("kind", opts.kind || "LOG");

  const res = await apiFetch("/api/v1/uploads", { method: "POST", body: form, headers: {} as any });
  return res.json() as Promise<{ uploadId: string; filename: string; sizeBytes: number }>;
}

export async function listJobUploads(jobId: string) {
  const res = await apiFetch(`/api/v1/uploads/jobs/${jobId}`);
  return res.json() as Promise<{ uploads: any[] }>;
}
