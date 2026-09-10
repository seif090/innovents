import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService, UploadFileOptions, UploadResult } from './storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly defaultBucket: string;
  private readonly endpoint: string;

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.get<string>('storage.endpoint', 'http://localhost:9000');
    const region = this.configService.get<string>('storage.region', 'us-east-1');
    const accessKeyId = this.configService.get<string>('storage.accessKey', 'minioadmin');
    const secretAccessKey = this.configService.get<string>('storage.secretKey', 'minioadmin');
    const forcePathStyle = this.configService.get<boolean>('storage.forcePathStyle', true);
    this.defaultBucket = this.configService.get<string>('storage.bucket', 'innovent-media');

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle,
    });
  }

  async upload(key: string, buffer: Buffer, options?: UploadFileOptions): Promise<UploadResult> {
    const bucket = options?.bucket || this.defaultBucket;
    const contentType = options?.contentType || 'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: options?.metadata,
    });

    await this.s3Client.send(command);
    this.logger.debug(`File uploaded successfully to ${bucket}/${key}`);

    return {
      key,
      url: this.getPublicUrl(key, bucket),
      bucket,
      size: buffer.length,
      contentType,
    };
  }

  async delete(key: string, bucket?: string): Promise<void> {
    const targetBucket = bucket || this.defaultBucket;
    const command = new DeleteObjectCommand({
      Bucket: targetBucket,
      Key: key,
    });
    await this.s3Client.send(command);
    this.logger.debug(`File deleted successfully from ${targetBucket}/${key}`);
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600, bucket?: string): Promise<string> {
    const targetBucket = bucket || this.defaultBucket;
    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  getPublicUrl(key: string, bucket?: string): string {
    const targetBucket = bucket || this.defaultBucket;
    return `${this.endpoint}/${targetBucket}/${key}`;
  }
}
