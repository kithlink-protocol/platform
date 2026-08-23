import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException } from '@nestjs/common';
import { Global, Injectable, Module } from '@nestjs/common';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'kithlink',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'kithlink_dev_minio',
      },
    });
    this.bucket = process.env.S3_BUCKET ?? 'kithlink-local';
  }

  async presignPut(
    key: string,
    mime: string,
    bytes: number,
    expiresIn = 600,
  ): Promise<{ url: string; fields: Record<string, string> | null }> {
    if (bytes < 1 || bytes > 26_214_400) throw new BadRequestException('Artifact size out of range');
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mime }),
      { expiresIn },
    );
    return { url, fields: null };
  }

  async presignGet(key: string, expiresIn = 120): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
    });
  }

  async head(key: string): Promise<{ bytes: number; mime: string | null } | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { bytes: out.ContentLength ?? 0, mime: out.ContentType ?? null };
    } catch (error) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        err.name === 'NotFound' ||
        err.name === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from((await out.Body?.transformToByteArray()) ?? []);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

@Global()
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
