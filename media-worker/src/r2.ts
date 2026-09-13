// Akses Cloudflare R2 via API S3-kompatibel (bucket PRIVATE).
// Presigned URL dibuat di sini (di Worker) — kredensial R2 tidak pernah
// keluar dari Worker (doc §7/§16).
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from './supabase';

let client: S3Client | null = null;

function r2(env: Env): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: 'auto',
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export const bucket = (env: Env) => env.BUCKET_NAME;

/**
 * Presigned PUT (doc §16): satu-kali-pakai, TTL pendek, dan MENUNDAKAN
 * Content-Type + Content-Length persis — browser harus mengirim byte dan
 * jenis yang sudah diajukannya ke `/media/upload-url`.
 */
export async function presignPut(
  env: Env,
  objectKey: string,
  contentType: string,
  contentLength: number,
  ttlSeconds: number,
): Promise<string> {
  // ContentType ikut ditandatangani (bagian canonical request): browser
  // WAJIB mengirim header Content-Type yang persis sama → klaim MIME di
  // upload-url terikat ke byte yang benar-benar diunggah.
  const command = new PutObjectCommand({
    Bucket: bucket(env),
    Key: objectKey,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(r2(env), command, { expiresIn: ttlSeconds });
}

export type ObjectInfo = { contentLength: number; contentType: string };

export async function headObject(env: Env, objectKey: string): Promise<ObjectInfo | null> {
  try {
    const out = (await r2(env).send(new HeadObjectCommand({ Bucket: bucket(env), Key: objectKey }))) as HeadObjectCommandOutput;
    if (out.$metadata.httpStatusCode === 404) return null;
    return { contentLength: out.ContentLength ?? 0, contentType: out.ContentType ?? '' };
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw e;
  }
}

/** Ambil prefix biner (magic bytes) untuk verifikasi signature gambar (doc §6). */
export async function fetchPrefixBytes(env: Env, objectKey: string, bytes = 64): Promise<Uint8Array> {
  const out = await r2(env).send(
    new GetObjectCommand({ Bucket: bucket(env), Key: objectKey, Range: `bytes=0-${bytes - 1}` }),
  );
  const body = out.Body;
  if (!body) throw new Error('object body kosong');
  const stream = body as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= bytes) break;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

/** Signed GET ber-TTL pendek untuk private read (doc §21). */
export async function presignGet(env: Env, objectKey: string, ttlSeconds: number): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket(env), Key: objectKey });
  return getSignedUrl(r2(env), command, { expiresIn: ttlSeconds });
}

/** Delete idempoten — object yang sudah tak ada dianggap sukses (doc §19). */
export async function deleteObject(env: Env, objectKey: string): Promise<void> {
  try {
    await r2(env).send(new DeleteObjectCommand({ Bucket: bucket(env), Key: objectKey }));
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status !== 404) throw e;
  }
}
