import { S3Client } from "@aws-sdk/client-s3";
declare const s3Client: S3Client;
export declare function initS3(): Promise<void>;
export declare function uploadFile(file: Express.Multer.File): Promise<string>;
export declare function getPublicUrl(key: string): string;
export default s3Client;
//# sourceMappingURL=storage.d.ts.map