import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.S3_BUCKET ?? '';

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes
}

const presignedUrlCache = new Map<string, { url: string; expires: number }>();

export async function getPresignedGetUrl(key: string): Promise<string | null> {
  if (!BUCKET) return null;
  const cached = presignedUrlCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
    presignedUrlCache.set(key, { url, expires: Date.now() + 50 * 60 * 1000 }); // cache 50 min
    return url;
  } catch {
    return null;
  }
}

export function clearPresignedUrlCache(key: string) {
  presignedUrlCache.delete(key);
}
