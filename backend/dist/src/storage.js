"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initS3 = initS3;
exports.uploadFile = uploadFile;
exports.getPublicUrl = getPublicUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3Client = new client_s3_1.S3Client({
    region: "us-east-1", // Minio needs a region, but doesn't care which one
    endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "root",
        secretAccessKey: process.env.S3_SECRET_KEY || "rootpassword",
    },
    forcePathStyle: true, // Needed for Minio
});
const bucketName = process.env.S3_BUCKET || "twit-media";
async function initS3() {
    try {
        await s3Client.send(new client_s3_1.HeadBucketCommand({ Bucket: bucketName }));
        console.log(`Bucket "${bucketName}" already exists.`);
    }
    catch (error) {
        if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
            console.log(`Bucket "${bucketName}" not found. Creating...`);
            await s3Client.send(new client_s3_1.CreateBucketCommand({ Bucket: bucketName }));
            console.log(`Bucket "${bucketName}" created successfully.`);
        }
        else {
            console.error("Error checking/creating bucket:", error);
        }
    }
}
async function uploadFile(file) {
    const key = `uploads/${Date.now()}-${file.originalname}`;
    await s3Client.send(new client_s3_1.PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Note: We don't set ACL "public-read" because Minio defaults to the policy we'll set on bucket.
    }));
    return key;
}
function getPublicUrl(key) {
    // In dev, this matches the NEXT_PUBLIC_S3_PUBLIC_URL/key
    return key;
}
exports.default = s3Client;
//# sourceMappingURL=storage.js.map