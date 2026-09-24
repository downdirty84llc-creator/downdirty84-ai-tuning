import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export type StoredObject = {
  provider: "S3" | "LOCAL";
  key: string;
};

function s3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    // Supabase and other custom S3 endpoints route buckets in the URL path.
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
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
  fs.mkdirSync(localDir(), { recursive: true });
  fs.writeFileSync(localPath(key), opts.body);
  return { provider: "LOCAL", key };
}

function localDir(): string {
  return process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), "tmp_uploads");
}

/**
 * Flatten the key into a single filename.
 *
 * The key is built from a userId and a sanitised original filename, so it
 * cannot contain traversal segments — but flattening removes any possibility
 * of a crafted key escaping the upload directory regardless.
 */
function localPath(key: string): string {
  return path.join(localDir(), key.replaceAll("/", "__"));
}

export class StorageReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageReadError";
  }
}

/**
 * Read a stored object back.
 *
 * Needed by the analysis engine: the upload path wrote the customer's log, and
 * nothing could read it again. A missing object throws rather than returning
 * empty, because an empty log and an unreachable log are different problems and
 * only one of them is the customer's fault.
 */
export async function readObject(stored: StoredObject): Promise<Buffer> {
  if (stored.provider === "S3") {
    if (!process.env.S3_BUCKET) {
      throw new StorageReadError("Object is stored in S3 but S3_BUCKET is not configured.");
    }
    const client = s3Client();
    const res = await client.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: stored.key })
    );
    const body = res.Body;
    if (!body) throw new StorageReadError(`Empty body for key ${stored.key}`);

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  const full = localPath(stored.key);
  if (!fs.existsSync(full)) {
    throw new StorageReadError(
      `Local object ${stored.key} is gone. Local storage is ephemeral on Render/Heroku — ` +
        `configure S3_BUCKET for uploads that must survive a restart.`
    );
  }
  return fs.readFileSync(full);
}
