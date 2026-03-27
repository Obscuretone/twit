import { S3Client, CreateBucketCommand, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "us-east-1", // Minio needs a region, but doesn't care which one
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "root",
    secretAccessKey: process.env.S3_SECRET_KEY || "rootpassword",
  },
  forcePathStyle: true, // Needed for Minio
});

const bucketName = process.env.S3_BUCKET || "twit-media";

export async function initS3() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`Bucket "${bucketName}" already exists.`);
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      console.log(`Bucket "${bucketName}" not found. Creating...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
      console.log(`Bucket "${bucketName}" created successfully.`);
    } else {
      console.error("Error checking/creating bucket:", error);
    }
  }
}

export async function uploadFile(file: Express.Multer.File): Promise<string> {
  const key = `uploads/${Date.now()}-${file.originalname}`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    // Note: We don't set ACL "public-read" because Minio defaults to the policy we'll set on bucket.
  }));

  return key;
}

export function getPublicUrl(key: string): string {
  // In dev, this matches the NEXT_PUBLIC_S3_PUBLIC_URL/key
  return key;
}

export default s3Client;
