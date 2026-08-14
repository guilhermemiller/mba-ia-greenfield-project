import type {
  CompleteUploadDto,
  InitiateUploadResult,
  Video,
} from "@/lib/api/contracts";

const baseInitiateUpload: InitiateUploadResult = {
  videoId: "video-upload-1",
  uploadId: "upload-123",
  partSize: 50 * 1024 * 1024,
  partCount: 2,
  storageKey: "videos/video-upload-1/source",
};

export const buildInitiateUpload = (
  overrides: Partial<InitiateUploadResult> = {},
): InitiateUploadResult => ({ ...baseInitiateUpload, ...overrides });

const baseVideo: Video = {
  id: "video-1",
  title: "My first video",
  description: "",
  visibility: "public",
  status: "processing",
  durationSeconds: null,
  width: null,
  height: null,
  viewsCount: null,
  thumbnailUrl: null,
  streamUrl: null,
  createdAt: "2026-08-06T00:00:00.000Z",
};

export const buildVideo = (overrides: Partial<Video> = {}): Video => ({
  ...baseVideo,
  ...overrides,
});

// Reserved trigger snapshots consumed by the E2E upload flow (see mocks/handlers/videos.ts).
export const buildUploadCompleteParts = (parts: CompleteUploadDto["parts"]) => parts;