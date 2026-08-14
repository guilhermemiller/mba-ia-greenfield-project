import { execFile } from 'node:child_process';
import { VideoWorkerService } from './video-worker.service';
import type { ConsumeMessage } from 'amqplib';

const QUEUE_CFG = {
  rabbitmqUrl: 'amqp://test',
  videoProcessingQueue: 'video_processing',
  videoDeadLetterQueue: 'video_processing_dlq',
  prefetch: 1,
  ffmpegBin: 'ffmpeg',
  ffprobeBin: 'ffprobe',
  thumbnailSize: '1280x720',
  thumbnailSeek: '00:00:01.000',
} as const;

/** Callback contract for node's execFile (err, stdout, stderr). */
type ExecFileCallback = (
  err: Error | null,
  stdout?: string,
  stderr?: string,
) => void;

/**
 * Mimics node's execFile promisify custom Symbol ({ stdout, stderr }) on the
 * mock so the service's `promisify(execFile)` destructuring keeps working in
 * tests. The node:child_process mock must be created inside the factory that
 * jest hoists above imports.
 */
jest.mock('node:child_process', () => {
  const promisifySymbol = Symbol.for('nodejs.util.promisify.custom');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const mockExecFile: jest.Mock<unknown, unknown[]> = jest.fn();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  (mockExecFile as any)[promisifySymbol] = function promisifiedExecFile(
    file: string,
    args?: readonly string[],
  ) {
    return new Promise((resolve, reject) => {
      const cb: ExecFileCallback = (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      };
      // Drop any trailing options arg and append our callback.
      mockExecFile(file, (args ?? []) as string[], cb);
    });
  };
  return { execFile: mockExecFile };
});

const FFPROBE_JSON = JSON.stringify({
  format: { duration: '120', size: '5242880' },
  streams: [{ width: 1280, height: 720, duration: '120' }],
});

function makeService() {
  const rabbitmqService = {
    subscribe: jest.fn().mockResolvedValue(undefined),
  };
  const videosService = {
    updateAfterProcessing: jest.fn().mockResolvedValue(undefined),
  };
  const storageService = {
    downloadObject: jest.fn().mockResolvedValue(undefined),
    uploadObject: jest.fn().mockResolvedValue(undefined),
  };

  const service = new VideoWorkerService(
    rabbitmqService as any,
    videosService as any,
    storageService as any,
    QUEUE_CFG as any,
  );

  return { service, rabbitmqService, videosService, storageService };
}

function makeMsg(content: unknown): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(content)),
    fields: {},
    properties: {},
  } as ConsumeMessage;
}

describe('VideoWorkerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes to the processing queue on init', async () => {
    const { service, rabbitmqService } = makeService();
    await service.onModuleInit();
    expect(rabbitmqService.subscribe).toHaveBeenCalledWith(
      'video_processing',
      expect.any(Function),
    );
  });

  it('downloads, probes, extracts thumbnail, uploads, and acks', async () => {
    const { service, videosService, storageService } = makeService();
    (execFile as unknown as jest.Mock).mockImplementation(
      (...args: unknown[]) => {
        const bin = args[0] as string;
        const cb = args[args.length - 1] as (
          err: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void;
        if (bin === 'ffprobe') return cb(null, FFPROBE_JSON, '');
        return cb(null, '', ''); // ffmpeg
      },
    );

    const ack = jest.fn();
    const nack = jest.fn();
    await service.handleJob(
      makeMsg({
        videoId: 'video-id-1',
        storageKey: 'videos/video-id-1/source',
      }),
      ack,
      nack,
    );

    expect(storageService.downloadObject).toHaveBeenCalledTimes(1);
    expect(storageService.uploadObject).toHaveBeenCalledWith(
      'thumbnails/video-id-1/thumb.jpg',
      expect.stringContaining('video-id-1'),
      'image/jpeg',
    );
    expect(videosService.updateAfterProcessing).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'video-id-1',
        durationSeconds: 120,
        width: 1280,
        height: 720,
        thumbnailKey: 'thumbnails/video-id-1/thumb.jpg',
      }),
    );
    expect(ack).toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks (no requeue) to dead-letter on worker failure', async () => {
    const { service } = makeService();
    (execFile as unknown as jest.Mock).mockImplementation(
      (...args: unknown[]) => {
        const cb = args[args.length - 1] as (
          err: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void;
        cb(new Error('ffprobe failed'), '', '');
      },
    );

    const ack = jest.fn();
    const nack = jest.fn();
    await service.handleJob(
      makeMsg({
        videoId: 'video-id-1',
        storageKey: 'videos/video-id-1/source',
      }),
      ack,
      nack,
    );

    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(false);
  });
});
