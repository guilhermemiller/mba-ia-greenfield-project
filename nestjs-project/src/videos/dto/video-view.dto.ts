import { Video, VideoStatus, VideoVisibility } from '../entities/video.entity';

export class VideoViewDto {
  id: string;
  title: string;
  description: string;
  visibility: VideoVisibility;
  status: VideoStatus;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  viewsCount: number;
  thumbnailUrl: string | null;
  streamUrl: string | null;
  createdAt: Date;

  static fromEntity(
    video: Video,
    thumbnailUrl?: string | null,
    streamUrl?: string | null,
  ): VideoViewDto {
    const dto = new VideoViewDto();
    dto.id = video.id;
    dto.title = video.title;
    dto.description = video.description;
    dto.visibility = video.visibility;
    dto.status = video.status;
    dto.durationSeconds = video.duration_seconds;
    dto.width = video.width;
    dto.height = video.height;
    dto.viewsCount = video.views_count;
    dto.thumbnailUrl = thumbnailUrl ?? null;
    dto.streamUrl = streamUrl ?? null;
    dto.createdAt = video.created_at;
    return dto;
  }
}
