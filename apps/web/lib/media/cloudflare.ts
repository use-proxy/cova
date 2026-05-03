import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const R2_BUCKET = process.env.R2_BUCKET_NAME ?? "cova-renders";
const IMAGES_API_TOKEN = process.env.CLOUDFLARE_IMAGES_API_TOKEN!;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export async function r2PutObject(key: string, body: Buffer, contentType = "image/jpeg") {
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return { bucket: R2_BUCKET, key };
}

export async function r2SignedGetUrl(key: string, expiresInSec = 3600): Promise<string> {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: expiresInSec });
}

export async function cfImagesUploadByUrl(sourceUrl: string, metadata: Record<string, string> = {}): Promise<{ id: string; variants: string[] }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${IMAGES_API_TOKEN}` },
    body: (() => {
      const fd = new FormData();
      fd.append("url", sourceUrl);
      fd.append("metadata", JSON.stringify(metadata));
      return fd;
    })(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`infra.cloudflare.images_unreachable: ${res.status} ${err}`);
  }
  const json = (await res.json()) as { result: { id: string; variants: string[] } };
  return json.result;
}
