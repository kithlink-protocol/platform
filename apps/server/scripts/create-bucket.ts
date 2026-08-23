import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const bucket = process.env.S3_BUCKET ?? 'kithlink-local';

const s3 = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'kithlink',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'kithlink_dev_minio',
  },
});

async function main(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[s3] bucket ${bucket} already exists`);
    return;
  } catch {
    // fall through to create
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`[s3] created bucket ${bucket}`);
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
      console.log(`[s3] bucket ${bucket} already exists`);
      return;
    }
    throw err;
  }
}

main().catch(err => {
  console.error('[s3] bucket bootstrap failed:', err);
  process.exit(1);
});
