import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '@trail/config';

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

/**
 * Upload a buffer to R2
 * @param key The R2 key (path)
 * @param body The file content
 * @param contentType The MIME type (e.g., image/jpeg)
 */
export async function upload(key: string, body: Buffer, contentType: string): Promise<string> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return key;
  } catch (error: any) {
    throw new StorageError(`Upload failed: ${error.message}`);
  }
}

/**
 * Generate a signed URL for reading an object from R2
 * @param key The R2 key
 * @param expiresIn Expiration in seconds (default 1 hour)
 */
export async function getSignedReadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error: any) {
    throw new StorageError(`Failed to generate signed URL: ${error.message}`);
  }
}

/**
 * Delete an object from R2
 * @param key The R2 key
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
      })
    );
  } catch (error: any) {
    throw new StorageError(`Delete failed: ${error.message}`);
  }
}

/**
 * Download an object from R2 as a Buffer
 * @param key The R2 key
 */
export async function download(key: string): Promise<Buffer> {
  try {
    const command = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error('Empty response body');
    }
    
    const stream = response.Body as any;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', (err: Error) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  } catch (error: any) {
    throw new StorageError(`Download failed: ${error.message}`);
  }
}
