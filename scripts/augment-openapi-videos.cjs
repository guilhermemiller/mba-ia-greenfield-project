/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEMP tool (host-only): hand-augment openapi.json with the Phase-03 /videos
 * endpoints that the backend exposes but haven't been exported yet (Docker-gated).
 * This is a stand-in for `openapi:export` until the container is available.
 * Run: node scripts/augment-openapi-videos.cjs  (from repo root)
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'nestjs-project/openapi.json');
const spec = JSON.parse(fs.readFileSync(file, 'utf8'));

const errRef = {
  schema: { $ref: '#/components/schemas/ApiErrorEnvelope' },
};

const videoSchemas = {
  InitiateUploadDto: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Video file name' },
      contentType: { type: 'string', description: 'MIME content type' },
      size: { type: 'integer', minimum: 1, maximum: 10737418240, description: 'Source file size in bytes (<= 10GB)' },
    },
    required: ['filename', 'contentType', 'size'],
  },
  UploadPartDto: {
    type: 'object',
    properties: { partNumber: { type: 'integer' }, etag: { type: 'string' } },
    required: ['partNumber', 'etag'],
  },
  CompleteUploadDto: {
    type: 'object',
    properties: {
      parts: { type: 'array', items: { $ref: '#/components/schemas/UploadPartDto' } },
    },
    required: ['parts'],
  },
  PresignPartQueryDto: {
    type: 'object',
    properties: { partNumber: { type: 'integer', minimum: 1 } },
    required: ['partNumber'],
  },
  InitiateUploadResult: {
    type: 'object',
    properties: {
      videoId: { type: 'string' },
      uploadId: { type: 'string' },
      partSize: { type: 'integer' },
      partCount: { type: 'integer' },
      storageKey: { type: 'string' },
    },
    required: ['videoId', 'uploadId', 'partSize', 'partCount', 'storageKey'],
  },
  VideoViewDto: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      visibility: { type: 'string', enum: ['public', 'unlisted'] },
      status: { type: 'string', enum: ['draft', 'processing', 'published', 'failed'] },
      durationSeconds: { type: 'number', nullable: true },
      width: { type: 'number', nullable: true },
      height: { type: 'number', nullable: true },
      viewsCount: { type: 'integer', nullable: true },
      thumbnailUrl: { type: 'string', nullable: true },
      streamUrl: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
    required: [
      'id', 'title', 'description', 'visibility', 'status',
      'durationSeconds', 'width', 'height', 'viewsCount',
      'thumbnailUrl', 'streamUrl', 'createdAt',
    ],
  },
};

const videoPaths = {
  '/videos/initiate-upload': {
    post: {
      description:
        'Creates an S3 multipart upload and a draft Video row owned by the caller channel.',
      operationId: 'VideosController_initiateUpload',
      parameters: [],
      security: [{ 'access-token': [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/InitiateUploadDto' } },
        },
      },
      responses: {
        201: {
          description: 'Multipart upload initiated',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/InitiateUploadResult' } },
          },
        },
        401: { description: 'Unauthorized', ...errRef },
        413: { description: 'File exceeds 10GB', ...errRef },
      },
    },
  },
  '/videos/{id}/presign-part': {
    get: {
      description: 'Get a presigned URL to upload a video part.',
      operationId: 'VideosController_presignPart',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'partNumber', in: 'query', required: true, schema: { type: 'integer', minimum: 1 } },
      ],
      security: { 'access-token': [] },
      responses: {
        200: {
          description: 'Presigned part URL',
          content: { 'application/json': { schema: { type: 'string' } } },
        },
        401: { description: 'Unauthorized', ...errRef },
        403: { description: 'Not owner', ...errRef },
        404: { description: 'Not found', ...errRef },
      },
    },
  },
  '/videos/{id}/complete': {
    post: {
      description: 'Complete a video multipart upload.',
      operationId: 'VideosController_completeUpload',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      security: { 'access-token': [] },
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CompleteUploadDto' } } },
      },
      responses: {
        200: {
          description: 'Upload completed; video queued for processing',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VideoViewDto' } } },
        },
        400: { description: 'Upload not initiated or parts incomplete', ...errRef },
        403: { description: 'Not owner', ...errRef },
        404: { description: 'Not found', ...errRef },
      },
    },
  },
  '/videos/{id}/abort': {
    post: {
      description: 'Abort a video multipart upload.',
      operationId: 'VideosController_abortUpload',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      security: { 'access-token': [] },
      responses: {
        200: {
          description: 'Upload aborted',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VideoViewDto' } } },
        },
        401: { description: 'Unauthorized', ...errRef },
        404: { description: 'Not found', ...errRef },
      },
    },
  },
  '/videos/{id}/stream': {
    get: {
      description: 'Get streaming URL for a video.',
      operationId: 'VideosController_stream',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Streaming URL or null while not published',
          content: { 'application/json': { schema: { type: 'string', nullable: true } } },
        },
        404: { description: 'Not found', ...errRef },
      },
    },
  },
  '/videos/{id}/download': {
    get: {
      description: 'Get presigned download URL for a video.',
      operationId: 'VideosController_download',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Presigned download URL',
          content: { 'application/json': { schema: { type: 'string' } } },
        },
        404: { description: 'Not found', ...errRef },
      },
    },
  },
  '/videos/{id}': {
    get: {
      description: 'Get public video view.',
      operationId: 'VideosController_getVideo',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Video view',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VideoViewDto' } } },
        },
        404: { description: 'Not found', ...errRef },
      },
    },
  },
};

// Inject schemas
if (!spec.components) spec.components = {};
if (!spec.components.schemas) spec.components.schemas = {};
Object.assign(spec.components.schemas, videoSchemas);

// Inject paths
if (!spec.paths) spec.paths = {};
Object.assign(spec.paths, videoPaths);

fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
console.log('Augmented openapi.json:');
console.log('  schemas:', Object.keys(videoSchemas).join(', '));
console.log('  paths:', Object.keys(videoPaths).join(', '));