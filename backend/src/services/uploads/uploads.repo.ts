import { query } from "../../db.js";

export type UploadRow = {
  id: string;
  user_id: string;
  job_id: string | null;
  kind: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_provider: string;
  storage_key: string;
  created_at: string;
};

export async function createUpload(row: Omit<UploadRow, "id" | "created_at">): Promise<UploadRow> {
  const r = await query<UploadRow>(
    `
    INSERT INTO uploads (user_id, job_id, kind, filename, mime_type, size_bytes, storage_provider, storage_key)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `,
    [
      row.user_id,
      row.job_id,
      row.kind,
      row.filename,
      row.mime_type,
      row.size_bytes,
      row.storage_provider,
      row.storage_key
    ]
  );
  return r[0];
}

export async function listUploadsForJob(userId: string, jobId: string): Promise<UploadRow[]> {
  return query<UploadRow>(
    `SELECT * FROM uploads WHERE user_id=$1 AND job_id=$2 ORDER BY created_at DESC`,
    [userId, jobId]
  );
}

export async function attachUploadsToJob(userId: string, jobId: string, uploadIds: string[]): Promise<void> {
  await query(
    `UPDATE uploads SET job_id=$1 WHERE user_id=$2 AND id = ANY($3::uuid[])`,
    [jobId, userId, uploadIds]
  );
}
