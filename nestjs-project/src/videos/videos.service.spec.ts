import { VideosService } from './videos.service';
import { Video, VideoStatus } from './entities/video.entity';
import { CompleteUploadDto } from './dto/complete-upload.dto';

const MOCK_QUEUE_CFG = {
  videoProcessingQueue: 'video_processing',
  videoDeadLetterQueue: 'video_processing_dlq',
  prefetch: 1,
  ffmpegBin: 'ffmpeg',
  ffprobeBin: 'ffprobe',
  thumbnailSize: '1280x720',
  thumbnailSeek: '00:00:01.000',
} as const;

function makeVideo(overrides: Partial<Video> = {}): Video {
  const video = new Video();
  video.id = 'video-id-1';
  video.channel_id = 'channel-id';
  video.title = 'clip.mp4';
  video.description = '';
  video.visibility = 'public' as Video['visibility'];
  video.status = VideoStatus.DRAFT;
  video.storage_key = 'videos/video-id-1/source';
  video.thumbnail_key = null;
  video.source_size = null;
  video.duration_seconds = null;
  video.width = null;
  video.height = null;
  video.views_count = 0;
  video.upload_id = null;
  video.created_at = new Date();
  video.updated_at = new Date();
  return Object.assign(video, overrides);
}

function makeService(repoOverrides: Record<string, jest.Mock> = {}) {
  const repo = {
    create: jest.fn((e: Video) => e),
    save: jest.fn((e: Video) => Promise.resolve(e)),
    findOne: jest.fn(),
    ...repoOverrides,
  };
  const channelsService = {
    findByUserId: jest.fn(),
  };
  const storageService = {
    createMultipartUpload: jest.fn(),
    presignUploadPartUrl: jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
    presignGetUrl: jest.fn(),
    publicUrl: jest.fn((key) => `http://minio/${key}`),
  };
  const rabbitmqService = {
    publish: jest.fn(),
  };

  const service = new VideosService(
    repo as any,
    channelsService as any,
    storageService as any,
    rabbitmqService as any,
    MOCK_QUEUE_CFG as any,
  );

  return { service, repo, channelsService, storageService, rabbitmqService };
}

describe('VideosService', () => {
  describe('partCountForSize', () => {
    it('rounds up to the next whole part', () => {
      const { service } = makeService();
      expect(service.partCountForSize(1)).toBe(1);
      expect(service.partCountForSize(50 * 1024 * 1024)).toBe(1);
      expect(service.partCountForSize(50 * 1024 * 1024 + 1)).toBe(2);
    });
  });

  describe('initiateUpload', () => {
    it('creates a multipart upload and a draft video row', async () => {
      const { service, repo, channelsService, storageService } = makeService();
      channelsService.findByUserId.mockResolvedValue({ id: 'channel-id' });
      storageService.createMultipartUpload.mockResolvedValue('upload-123');

      const result = await service.initiateUpload(
        'user-id',
        'clip.mp4',
        'video/mp4',
        1024,
      );

      expect(channelsService.findByUserId).toHaveBeenCalledWith('user-id');
      expect(storageService.createMultipartUpload).toHaveBeenCalledWith(
        expect.stringContaining('/source'),
        'video/mp4',
      );
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        uploadId: 'upload-123',
        partSize: 50 * 1024 * 1024,
        partCount: 1,
      });
    });

    it('rejects a file larger than 10GB', async () => {
      const { service } = makeService();
      await expect(
        service.initiateUpload(
          'user-id',
          'big.mp4',
          'video/mp4',
          11 * 1024 * 1024 * 1024,
        ),
      ).rejects.toThrow('10GB limit');
    });
  });

  describe('presignPart', () => {
    it('returns a presigned URL for the requested part', async () => {
      const { service, repo, channelsService, storageService } = makeService();
      repo.findOne.mockResolvedValue(
        makeVideo({ channel_id: 'channel-id', upload_id: 'upload-123' }),
      );
      channelsService.findByUserId.mockResolvedValue({ id: 'channel-id' });
      storageService.presignUploadPartUrl.mockResolvedValue(
        'https://presigned',
      );

      const url = await service.presignPart('user-id', 'video-id-1', 2);

      expect(storageService.presignUploadPartUrl).toHaveBeenCalledWith(
        'videos/video-id-1/source',
        'upload-123',
        2,
      );
      expect(url).toBe('https://presigned');
    });

    it('throws when the video has no active upload', async () => {
      const { service, repo, channelsService } = makeService();
      repo.findOne.mockResolvedValue(
        makeVideo({ channel_id: 'channel-id', upload_id: null }),
      );
      channelsService.findByUserId.mockResolvedValue({ id: 'channel-id' });

      await expect(
        service.presignPart('user-id', 'video-id-1', 1),
      ).rejects.toThrow('not been initiated');
    });
  });

  describe('completeUpload', () => {
    it('completes multipart, queues processing, and returns a view', async () => {
      const {
        service,
        repo,
        channelsService,
        storageService,
        rabbitmqService,
      } = makeService();
      const video = makeVideo({
        status: VideoStatus.PROCESSING,
        upload_id: 'upload-123',
        source_size: String(1),
      });
      repo.findOne.mockResolvedValue(video);
      channelsService.findByUserId.mockResolvedValue({ id: 'channel-id' });

      const dto: CompleteUploadDto = {
        parts: [{ partNumber: 1, etag: '"abc"' }],
      };
      const result = await service.completeUpload('user-id', 'video-id-1', dto);

      expect(storageService.completeMultipartUpload).toHaveBeenCalledWith(
        'videos/video-id-1/source',
        'upload-123',
        [{ partNumber: 1, etag: '"abc"' }],
      );
      expect(video.upload_id).toBeNull();
      expect(rabbitmqService.publish).toHaveBeenCalledWith('video_processing', {
        videoId: 'video-id-1',
        storageKey: 'videos/video-id-1/source',
      });
      expect(result).toMatchObject({ id: 'video-id-1' });
    });

    it('throws when not all expected parts are supplied', async () => {
      const { service, repo, channelsService } = makeService();
      repo.findOne.mockResolvedValue(
        makeVideo({
          channel_id: 'channel-id',
          upload_id: 'upload-123',
          source_size: String(2 * 50 * 1024 * 1024),
        }),
      );
      channelsService.findByUserId.mockResolvedValue({ id: 'channel-id' });

      const dto: CompleteUploadDto = {
        parts: [{ partNumber: 1, etag: '"a"' }],
      };
      await expect(
        service.completeUpload('user-id', 'video-id-1', dto),
      ).rejects.toThrow('All upload parts');
    });
  });

  describe('ownership', () => {
    it('throws when the caller is not the channel owner', async () => {
      const { service, repo, channelsService } = makeService();
      repo.findOne.mockResolvedValue(
        makeVideo({ channel_id: 'channel-other', upload_id: 'upload-123' }),
      );
      channelsService.findByUserId.mockResolvedValue({ id: 'channel-id' });

      await expect(
        service.presignPart('user-1', 'video-id-1', 1),
      ).rejects.toThrow('do not own');
    });

    it('throws 404-style not owned when the video is missing', async () => {
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(null);
      await expect(service.presignPart('user-1', 'nope', 1)).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('getStreamUrl', () => {
    it('returns null for draft/failed videos', () => {
      const { service } = makeService();
      expect(
        service.getStreamUrl(makeVideo({ status: VideoStatus.DRAFT })),
      ).toBeNull();
      expect(
        service.getStreamUrl(makeVideo({ status: VideoStatus.FAILED })),
      ).toBeNull();
    });

    it('returns a public URL for published videos', () => {
      const { service } = makeService();
      const url = service.getStreamUrl(
        makeVideo({ status: VideoStatus.PUBLISHED }),
      );
      expect(url).toContain('videos/video-id-1/source');
    });
  });

  describe('updateAfterProcessing', () => {
    it('marks published and stores metadata', async () => {
      const { service, repo } = makeService();
      const video = makeVideo();
      repo.findOne.mockResolvedValue(video);

      const result = await service.updateAfterProcessing({
        id: 'video-id-1',
        durationSeconds: 120,
        width: 1280,
        height: 720,
        sourceSize: 5242880,
        thumbnailKey: 'thumbnails/video-id-1/thumb.jpg',
      });

      expect(result.status).toBe(VideoStatus.PUBLISHED);
      expect(result.duration_seconds).toBe(120);
      expect(result.thumbnail_key).toBe('thumbnails/video-id-1/thumb.jpg');
    });
  });
});
