export interface UploadFileOptions {
  bucket?: string;
  contentType?: string;
  isPrivate?: boolean;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
  size: number;
  contentType: string;
}

export interface StorageService {
  upload(key: string, buffer: Buffer, options?: UploadFileOptions): Promise<UploadResult>;

  delete(key: string, bucket?: string): Promise<void>;

  getSignedUrl(key: string, expiresInSeconds?: number, bucket?: string): Promise<string>;

  getPublicUrl(key: string, bucket?: string): string;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
