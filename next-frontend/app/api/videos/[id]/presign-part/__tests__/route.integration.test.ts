import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";

const cookieMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
    set: (name: string, value: string) => { cookieMap.set(name, value); },
    delete: (name: string) => { cookieMap.delete(name); },
  }),
}));

let GET: (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/videos/[id]/presign-part/route"));
});

const { setSession } = await import("@/lib/auth/session");

beforeEach(async () => {
  cookieMap.clear();
  await setSession({
    accessToken: "active-at",
    refreshToken: "active-rt",
    userId: "u1",
    email: "alice@example.com",
    channelSlug: "alice",
  });
});

function makeRequest(id: string, partNumber?: string | null) {
  const url = `http://localhost/api/videos/${id}/presign-part${
    partNumber != null ? `?partNumber=${partNumber}` : ""
  }`;
  return new Request(url, { method: "GET" });
}

const ctx = { params: Promise.resolve({ id: "video-upload-1" }) };

describe("GET /api/videos/[id]/presign-part", () => {
  it("returns a presigned part URL (wrapped) when authenticated", async () => {
    const res = await GET(makeRequest("video-upload-1", "1"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ partUrl: expect.any(String) });
  });

  it("returns 400 when partNumber is missing", async () => {
    const res = await GET(makeRequest("video-upload-1"), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    cookieMap.clear();
    const res = await GET(makeRequest("video-upload-1", "1"), ctx);
    expect(res.status).toBe(401);
  });

  it("forwards upstream errors (reserved trigger video-incomplete) with the envelope", async () => {
    server.use(
      http.get(`${env.API_URL}/videos/:videoId/presign-part`, () =>
        HttpResponse.json(
          { statusCode: 404, error: "VIDEO_NOT_FOUND", message: "Video not found" },
          { status: 404 },
        ),
      ),
    );
    const res = await GET(
      makeRequest("video-missing", "1"),
      ctx,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: "VIDEO_NOT_FOUND" });
  });
});