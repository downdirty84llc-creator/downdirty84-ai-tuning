import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export type StoredObject = {
  provider: "S3" | "LOCAL";
  key: string;
};

function s3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: process.env.S3_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!
        }
      : undefined
  });
}

export async function storeBuffer(opts: {
  userId: string;
  filename: string;
  mimeType?: string | null;
  body: Buffer;
}): Promise<StoredObject> {
  const useS3 = Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

  const safeName = opts.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const key = `dd84/${opts.userId}/${Date.now()}_${safeName}`;

  if (useS3) {
    const client = s3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: opts.body,
        ContentType: opts.mimeType || "application/octet-stream"
      })
    );
    return { provider: "S3", key };
  }

  // LOCAL fallback (Render ephemeral). Good for dev.
  const dir = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), "tmp_uploads");
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, key.replaceAll("/", "__"));
  fs.writeFileSync(full, opts.body);
  return { provider: "LOCAL", key };
}
