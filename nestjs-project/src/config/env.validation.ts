import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
  CONFIRMATION_TOKEN_EXPIRATION_HOURS: Joi.number().default(1),
  PASSWORD_RESET_TOKEN_EXPIRATION_HOURS: Joi.number().default(1),
  APP_URL: Joi.string().uri().default('http://localhost:3002'),
  MAIL_HOST: Joi.string().default('mailpit'),
  MAIL_PORT: Joi.number().default(1025),
  MAIL_FROM: Joi.string().default('"StreamTube" <noreply@streamtube.com>'),
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('false'),
  // Storage (MinIO / S3-compatible)
  S3_ENDPOINT: Joi.string().default('http://minio:9000'),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().default('streamtube'),
  S3_SECRET_KEY: Joi.string().default('streamtube'),
  S3_BUCKET: Joi.string().default('streamtube-media'),
  S3_PUBLIC_BASE_URL: Joi.string().default(
    'http://localhost:9000/streamtube-media',
  ),
  PRESIGNED_URL_EXPIRES: Joi.number().default(3600),
  // Queue (RabbitMQ)
  RABBITMQ_URL: Joi.string().default(
    'amqp://streamtube:streamtube@rabbitmq:5672',
  ),
  VIDEO_PROCESSING_QUEUE: Joi.string().default('video_processing'),
  VIDEO_DEAD_LETTER_QUEUE: Joi.string().default('video_processing_dlq'),
  QUEUE_PREFETCH: Joi.number().default(1),
  WORKER_FFMPEG_BIN: Joi.string().default('ffmpeg'),
  WORKER_FFPROBE_BIN: Joi.string().default('ffprobe'),
  THUMBNAIL_SIZE: Joi.string().default('1280x720'),
  THUMBNAIL_SEEK: Joi.string().default('00:00:01.000'),
});
