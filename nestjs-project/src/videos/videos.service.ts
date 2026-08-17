import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import queueConfig from '../config/queue.config';
import { ChannelsService } from '../channels/channels.service';
import { Video, VideoStatus } from './entities/video.entity';
import { VideoViewDto } from './dto/video-view.dto';
import { StorageService } from '../storage/storage.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import {
  MAX_FILE_SIZE_BYTES,
  PART_SIZE_BYTES,
  SOURCE_KEY_PREFIX,
} from './videos.constants';
import {
  VideoNotFoundException,
  VideoNotOwnedException,
  VideoUploadNotInitiatedException,
  VideoUploadPartsIncompleteException,
  VideoUploadTooLargeException,
} from './videos.exception';
import { generateVideoId } from './video-id.util';

export interface InitiateUploadResult {
  videoId: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  storageKey: string;
}

export interface ProcessingUpdate {
  id: string;
  durationSeconds: number;
  width: number;
  height: number;
  sourceSize: number;
  thumbnailKey: string;
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly channelsService: ChannelsService,
    private readonly storageService: StorageService,
    private readonly rabbitmqService: RabbitmqService,
    @Inject(queueConfig.KEY)
    private readonly queueCfg: ConfigType<typeof queueConfig>,
  ) {}

  /** Number of parts for a given file size, rounded up. */
  partCountForSize(size: number): number {
    return Math.ceil(size / PART_SIZE_BYTES);
  }

  async initiateUpload(
    userId: string,
    filename: string,
    contentType: string,
    size: number,
  ): Promise<InitiateUploadResult> {
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new VideoUploadTooLargeException();
    }

    const channel = await this.channelsService.findByUserId(userId);
    if (!channel) {
      throw new VideoNotFoundException();
    }

    const id = generateVideoId();
    const storageKey = `${SOURCE_KEY_PREFIX}/${id}/source`;
    const uploadId = await this.storageService.createMultipartUpload(
      storageKey,
      contentType,
    );

    const video = this.videoRepository.create({
      id,
      channel_id: channel.id,
      title: filename,
      description: '',
      storage_key: storageKey,
      status: VideoStatus.DRAFT,
      upload_id: uploadId,
      source_size: String(size),
    });
    await this.videoRepository.save(video);

    return {
      videoId: id,
      uploadId,
      partSize: PART_SIZE_BYTES,
      partCount: this.partCountForSize(size),
      storageKey,
    };
  }

  async presignPart(
    userId: string,
    videoId: string,
    partNumber: number,
  ): Promise<string> {
    const video = await this.getOwnedVideo(userId, videoId);
    if (!video.upload_id) {
      throw new VideoUploadNotInitiatedException();
    }
    return this.storageService.presignUploadPartUrl(
      video.storage_key,
      video.upload_id,
      partNumber,
    );
  }

  async completeUpload(
    userId: string,
    videoId: string,
    dto: CompleteUploadDto,
  ): Promise<VideoViewDto> {
    const video = await this.getOwnedVideo(userId, videoId);
    if (!video.upload_id) {
      throw new VideoUploadNotInitiatedException();
    }

    const sortedParts = [...dto.parts].sort(
      (a, b) => a.partNumber - b.partNumber,
    );
    const expectedCount = this.partCountForSize(Number(video.source_size ?? 0));
    if (sortedParts.length !== expectedCount) {
      throw new VideoUploadPartsIncompleteException();
    }

    await this.storageService.completeMultipartUpload(
      video.storage_key,
      video.upload_id,
      sortedParts,
    );

    video.status = VideoStatus.PROCESSING;
    video.upload_id = null;
    await this.videoRepository.save(video);

    await this.rabbitmqService.publish(this.queueCfg.videoProcessingQueue, {
      videoId: video.id,
      storageKey: video.storage_key,
    });

    return await this.toView(video);
  }

  async abortUpload(userId: string, videoId: string): Promise<VideoViewDto> {
    const video = await this.getOwnedVideo(userId, videoId);
    if (!video.upload_id) {
      throw new VideoUploadNotInitiatedException();
    }
    await this.storageService.abortMultipartUpload(
      video.storage_key,
      video.upload_id,
    );
    video.status = VideoStatus.FAILED;
    video.upload_id = null;
    await this.videoRepository.save(video);
    return await this.toView(video);
  }

  async getVideo(videoId: string): Promise<VideoViewDto> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    return await this.toView(video);
  }

  /** Public stream URL honoring Range; only for published/processing videos. */
  async getStreamUrl(video: Video): Promise<string | null> {
    if (
      video.status === VideoStatus.DRAFT ||
      video.status === VideoStatus.FAILED
    ) {
      return null;
    }
    return await this.storageService.presignGetUrl(video.storage_key);
  }

  async getStreamUrlPublic(videoId: string): Promise<string | null> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    return await this.getStreamUrl(video);
  }

  async getDownloadUrl(videoId: string): Promise<string> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    return this.storageService.presignGetUrl(video.storage_key, undefined, {
      attachmentFilename: `${video.title}.mp4`,
    });
  }

  async updateAfterProcessing(update: ProcessingUpdate): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: update.id },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    video.status = VideoStatus.PUBLISHED;
    video.duration_seconds = update.durationSeconds;
    video.width = update.width;
    video.height = update.height;
    video.source_size = String(update.sourceSize);
    video.thumbnail_key = update.thumbnailKey;
    return this.videoRepository.save(video);
  }

  private async getOwnedVideo(userId: string, videoId: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    const channel = await this.channelsService.findByUserId(userId);
    if (!channel || channel.id !== video.channel_id) {
      throw new VideoNotOwnedException();
    }
    return video;
  }

  private async toView(video: Video): Promise<VideoViewDto> {
    return VideoViewDto.fromEntity(
      video,
      await this.getThumbnailUrl(video),
      await this.getStreamUrl(video),
    );
  }

  private async getThumbnailUrl(video: Video): Promise<string | null> {
    if (!video.thumbnail_key) return null;
    return await this.storageService.presignGetUrl(video.thumbnail_key);
  }
}
