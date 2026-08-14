import { S3Client } from '@aws-sdk/client-s3';
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

const STORAGE_CFG = {
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  accessKey: 'streamtube',
  secretKey: 'streamtube',
  bucket: 'streamtube-media',
  publicBaseUrl: 'http://localhost:9000/streamtube-media',
  presignedUrlExpires: 3600,
} as const;

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('StorageService', () => {
  let service: StorageService;
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ UploadId: 'upload-123' } as never);
    (getSignedUrl as jest.Mock).mockResolvedValue('https://presigned');
    service = new StorageService(STORAGE_CFG as never);
  });

  afterEach(() => {
    send.mockRestore();
  });

  it('returns the configured bucket', () => {
    expect(service.getBucket()).toBe('streamtube-media');
  });

  it('creates a multipart upload with the content type', async () => {
    const uploadId = await service.createMultipartUpload(
      'videos/x/source',
      'video/mp4',
    );

    expect(uploadId).toBe('upload-123');
    expect(send).toHaveBeenCalledWith(expect.any(CreateMultipartUploadCommand));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const command = (send.mock.calls[0]?.[0] ??
      new CreateMultipartUploadCommand({
        Bucket: 'bucket',
        Key: 'key',
        ContentType: 'video/mp4',
      })) as CreateMultipartUploadCommand;
    expect(command.input).toMatchObject({
      Bucket: 'streamtube-media',
      Key: 'videos/x/source',
      ContentType: 'video/mp4',
    });
  });

  it('presigns an upload part URL', async () => {
    const url = await service.presignUploadPartUrl(
      'videos/x/source',
      'upload-123',
      3,
    );

    expect(url).toBe('https://presigned');
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it('completes a multipart upload with sorted parts', async () => {
    await service.completeMultipartUpload('videos/x/source', 'upload-123', [
      { partNumber: 2, etag: '"b"' },
      { partNumber: 1, etag: '"a"' },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const command = (send.mock.calls[0]?.[0] ??
      new CompleteMultipartUploadCommand({
        Bucket: 'bucket',
        Key: 'key',
        UploadId: 'upload',
      })) as CompleteMultipartUploadCommand;
    expect(command.input).toMatchObject({
      UploadId: 'upload-123',
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: '"a"' },
          { PartNumber: 2, ETag: '"b"' },
        ],
      },
    });
  });

  it('builds a public URL from the base URL and key', () => {
    expect(service.publicUrl('videos/x/source')).toBe(
      'http://localhost:9000/streamtube-media/videos/x/source',
    );
  });
});
