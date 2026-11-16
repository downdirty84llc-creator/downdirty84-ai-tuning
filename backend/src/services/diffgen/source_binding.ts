import type { UploadRow } from "../uploads/uploads.repo.js";

/** Resolve only the exact owner/job log whose recorded safety verdict cleared generation. */
export async function resolveGenerationSource(input: {
  userId: string;
  jobId: string;
  analyzedUploadId: unknown;
  requestedUploadId: unknown;
}, load: (userId: string, ids: string[]) => Promise<UploadRow[]>): Promise<UploadRow | null> {
  const { userId, jobId, analyzedUploadId, requestedUploadId } = input;
  // Older or incomplete runs without provenance must be analysed again.
  if (typeof analyzedUploadId !== "string" || !analyzedUploadId) return null;
  if (requestedUploadId !== undefined && requestedUploadId !== analyzedUploadId) return null;
  const rows = await load(userId, [analyzedUploadId]);
  const source = rows.find(row => row.id === analyzedUploadId);
  if (!source || source.user_id !== userId || source.job_id !== jobId) return null;
  return source;
}
