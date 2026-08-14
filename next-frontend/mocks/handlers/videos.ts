import { http, HttpResponse } from "msw";

import type {
  ApiErrorEnvelope,
  CompleteUploadDto,
  Video,
} from "@/lib/api/contracts";
import { env } from "@/lib/env";
import { buildInitiateUpload, buildVideo } from "@/mocks/factories/videos";

// Reserved trigger table (shared with E2E — values must not collide with auth fixtures).
const TOO_LARGE_FILENAME = "too-big.mp4";
const INCOMPLETE_PARTS = 0; // a complete request with zero parts → 400

function errorEnvelope(
  statusCode: number,
  error: string,
  message: string,
): ApiErrorEnvelope {
  return { statusCode, error, message, code: null };
}

export const handlers = [
  // POST /videos/initiate-upload
  http.post(`${env.API_URL}/videos/initiate-upload`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const filename = typeof body.filename === "string" ? body.filename : "";

    if (filename === TOO_LARGE_FILENAME) {
      return HttpResponse.json(
        errorEnvelope(413, "VIDEO_UPLOAD_TOO_LARGE", "Video file exceeds the 10GB limit"),
        { status: 413 },
      );
    }
    return HttpResponse.json(buildInitiateUpload(), { status: 201 });
  }),

  // GET /videos/{id}/presign-part
  http.get(`${env.API_URL}/videos/:videoId/presign-part`, () =>
    HttpResponse.json(`https://presigned-part-url`, { status: 200 }),
  ),

  // POST /videos/{id}/complete
  http.post(`${env.API_URL}/videos/:videoId/complete`, async ({ request }) => {
    const body = (await request.json()) as CompleteUploadDto;
    if (!body.parts || body.parts.length === INCOMPLETE_PARTS) {
      return HttpResponse.json(
        errorEnvelope(400, "VIDEO_UPLOAD_PARTS_INCOMPLETE", "All upload parts must be included to complete the upload"),
        { status: 400 },
      );
    }
    return HttpResponse.json<Video>(buildVideo({ status: "processing" }), {
      status: 200,
    });
  }),

  // POST /videos/{id}/abort
  http.post(`${env.API_URL}/videos/:videoId/abort`, () =>
    HttpResponse.json<Video>(buildVideo({ status: "failed" }), { status: 200 }),
  ),
];