import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import queueConfig from '../config/queue.config';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { StorageService } from '../storage/storage.service';
import { VideosService } from './videos.service';
import { THUMBNAIL_KEY_PREFIX } from './videos.constants';
import type { ConsumeMessage } from 'amqplib';

const execFileAsync = promisify(execFile);

interface ProcessingJob {
  videoId: string;
  storageKey: string;
}

interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  sizeBytes: number;
}

interface FfprobeJson {
  format?: { duration?: string; size?: string };
  streams?: Array<{ width?: number; height?: number; duration?: string }>;
}

@Injectable()
export class VideoWorkerService implements OnModuleInit {
  private readonly logger = new Logger(VideoWorkerService.name);

  constructor(
    private readonly rabbitmqService: RabbitmqService,
    private readonly videosService: VideosService,
    private readonly storageService: StorageService,
    @Inject(queueConfig.KEY)
    private readonly queueCfg: ConfigType<typeof queueConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.rabbitmqService.subscribe(
        this.queueCfg.videoProcessingQueue,
        (msg, ack, nack) => this.handleJob(msg, ack, nack),
      );
      this.logger.log(`Subscribed to ${this.queueCfg.videoProcessingQueue}`);
    } catch (err) {
      this.logger.warn(
        `Could not subscribe to queue: ${(err as Error).message}`,
      );
    }
  }

  async handleJob(
    msg: ConsumeMessage,
    ack: () => void,
    nack: (requeue?: boolean) => void,
  ): Promise<void> {
    const job = JSON.parse(msg.content.toString()) as ProcessingJob;
    this.logger.log(`Processing video ${job.videoId}`);
    const localSource = `/tmp/streamtube-${job.videoId}-source.mp4`;
    const localThumb = `/tmp/streamtube-${job.videoId}-thumb.jpg`;

    try {
      // 1. Download source from object storage to a local temp file.
      await this.storageService.downloadObject(job.storageKey, localSource);

      // 2. Probe metadata (duration, resolution) with ffprobe.
      const metadata = await this.probe(localSource);

      // 3. Extract a thumbnail frame with ffmpeg.
      await this.extractThumbnail(localSource, localThumb);

      // 4. Upload the thumbnail to object storage.
      const thumbnailKey = `${THUMBNAIL_KEY_PREFIX}/${job.videoId}/thumb.jpg`;
      await this.storageService.uploadObject(
        thumbnailKey,
        localThumb,
        'image/jpeg',
      );

      // 5. Mark the video published with its metadata.
      await this.videosService.updateAfterProcessing({
        id: job.videoId,
        durationSeconds: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        sourceSize: metadata.sizeBytes ?? 0,
        thumbnailKey,
      });

      ack();
    } catch (err) {
      this.logger.error(
        `Failed to process video ${job.videoId}: ${(err as Error).message}`,
      );
      nack(false); // requeue=false → dead-letter queue
    } finally {
      // Best-effort cleanup of temp files.
      await Promise.all([
        rm(localSource, { force: true }).catch(() => undefined),
        rm(localThumb, { force: true }).catch(() => undefined),
      ]);
    }
  }

  private async probe(localSource: string): Promise<ProbeResult> {
    const { stdout } = await execFileAsync(this.queueCfg.ffprobeBin, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      localSource,
    ]);
    const data = JSON.parse(stdout) as FfprobeJson;
    const videoStream =
      data.streams?.find((s) => s.width != null && s.height != null) ??
      data.streams?.[0];
    return {
      duration: Math.round(Number(data.format?.duration ?? 0)),
      width: videoStream?.width ?? 0,
      height: videoStream?.height ?? 0,
      sizeBytes: Number(data.format?.size ?? 0),
    };
  }

  private async extractThumbnail(
    localSource: string,
    localThumb: string,
  ): Promise<void> {
    await execFileAsync(this.queueCfg.ffmpegBin, [
      '-y',
      '-ss',
      this.queueCfg.thumbnailSeek,
      '-i',
      localSource,
      '-frames:v',
      '1',
      '-vf',
      `scale=${this.queueCfg.thumbnailSize}`,
      localThumb,
    ]);
  }
}
