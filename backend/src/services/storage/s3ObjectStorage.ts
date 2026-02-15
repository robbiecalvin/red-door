import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ObjectStorage } from "../mediaService";

export type S3Config = Readonly<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}>;

export function createS3ObjectStorage(config: S3Config): ObjectStorage {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle === true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  return {
    async presignPutObject(params) {
      const cmd = new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        ContentType: params.mimeType
      });
      return getSignedUrl(client, cmd, { expiresIn: params.expiresInSeconds });
    },

    async presignGetObject(params) {
      const cmd = new GetObjectCommand({ Bucket: params.bucket, Key: params.key });
      return getSignedUrl(client, cmd, { expiresIn: params.expiresInSeconds });
    },

    async headObject(params) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: params.bucket, Key: params.key }));
        const sizeBytes = typeof res.ContentLength === "number" ? res.ContentLength : undefined;
        return { ok: true as const, sizeBytes };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "S3 error.";
        return { ok: false as const, error: msg };
      }
    }
  };
}
