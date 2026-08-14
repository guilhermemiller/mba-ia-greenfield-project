import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import storageConfig from '../config/storage.config';

export interface UploadPart {
  partNumber: number;
  etag: string;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
    });
  }

  getBucket(): string {
    return this.config.bucket;
  }

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
    });
    const response = await this.client.send(command);
    if (!response.UploadId) {
      throw new Error('Failed to initiate multipart upload');
    }
    return response.UploadId;
  }

  async presignUploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn?: number,
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.config.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    // To prevent SignatureDoesNotMatch errors when accessing from outside Docker,
    // we must generate the signature using the host-reachable endpoint so the Host header matches.
    // If publicBaseUrl differs from endpoint, we create a temporary client with the public endpoint just for presigning.
    const publicOrigin = new URL(this.config.publicBaseUrl).origin;
    const internalOrigin = new URL(this.config.endpoint).origin;

    let presignClient = this.client;
    if (publicOrigin !== internalOrigin) {
      presignClient = new S3Client({
        region: this.config.region,
        endpoint: publicOrigin,
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.accessKey,
          secretAccessKey: this.config.secretKey,
        },
      });
    }

    return getSignedUrl(presignClient, command, {
      expiresIn: expiresIn ?? this.config.presignedUrlExpires,
    });
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadPart[],
  ): Promise<void> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.config.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
          })),
      },
    });
    await this.client.send(command);
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.config.bucket,
      Key: key,
      UploadId: uploadId,
    });
    await this.client.send(command);
  }

  async presignGetUrl(
    key: string,
    expiresIn?: number,
    options?: { attachmentFilename?: string },
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresIn ?? this.config.presignedUrlExpires,
      ...(options?.attachmentFilename
        ? {
            query: {
              'response-content-disposition': `attachment; filename="${options.attachmentFilename}"`,
            },
          }
        : {}),
    });
  }

  /** Streams an object's bytes to a local file path (used by the worker). */
  async downloadObject(key: string, localPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });
    const response = await this.client.send(command);
    const body = response.Body;
    if (!body) {
      throw new Error('Object has no body');
    }
    await pipeline(body as Readable, createWriteStream(localPath));
  }

  /** Writes a local file (e.g. generated thumbnail) to the bucket. */
  async uploadObject(
    key: string,
    localPath: string,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      Body: createReadStream(localPath),
    });
    await this.client.send(command);
  }

  publicUrl(key: string): string {
    // Public / CDN-style base URL for objects; used for streaming via Range.
    return `${this.config.publicBaseUrl}/${key}`;
  }
}
