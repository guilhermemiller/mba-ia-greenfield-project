import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  rabbitmqUrl:
    process.env.RABBITMQ_URL || 'amqp://streamtube:streamtube@rabbitmq:5672',
  videoProcessingQueue:
    process.env.VIDEO_PROCESSING_QUEUE || 'video_processing',
  videoDeadLetterQueue:
    process.env.VIDEO_DEAD_LETTER_QUEUE || 'video_processing_dlq',
  prefetch: parseInt(process.env.QUEUE_PREFETCH || '1', 10),
  ffmpegBin: process.env.WORKER_FFMPEG_BIN || 'ffmpeg',
  ffprobeBin: process.env.WORKER_FFPROBE_BIN || 'ffprobe',
  thumbnailSize: process.env.THUMBNAIL_SIZE || '1280x720',
  thumbnailSeek: process.env.THUMBNAIL_SEEK || '00:00:01.000',
}));
