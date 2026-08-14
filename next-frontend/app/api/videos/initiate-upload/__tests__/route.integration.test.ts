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

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/videos/initiate-upload/route"));
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

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/videos/initiate-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/videos/initiate-upload", () => {
  it("returns 201 with an initiate upload result when authenticated", async () => {
    const res = await POST(
      makeRequest({ filename: "clip.mp4", contentType: "video/mp4", size: 1024 }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      videoId: expect.any(String),
      uploadId: expect.any(String),
      partSize: expect.any(Number),
      partCount: expect.any(Number),
    });
  });

  it("returns 413 for files exceeding 10GB (reserved trigger too-big.mp4)", async () => {
    const res = await POST(
      makeRequest({ filename: "too-big.mp4", contentType: "video/mp4", size: 11 * 1024 ** 3 }),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toMatchObject({ statusCode: 413, error: "VIDEO_UPLOAD_TOO_LARGE" });
  });

  it("returns 401 when no authenticated session is present", async () => {
    cookieMap.clear();
    const res = await POST(
      makeRequest({ filename: "clip.mp4", contentType: "video/mp4", size: 1024 }),
    );
    expect(res.status).toBe(401);
  });

  it("forwards upstream errors with the envelope", async () => {
    server.use(
      http.post(`${env.API_URL}/videos/initiate-upload`, () =>
        HttpResponse.json(
          { statusCode: 500, error: "INTERNAL_ERROR", message: "boom" },
          { status: 500 },
        ),
      ),
    );
    const res = await POST(
      makeRequest({ filename: "clip.mp4", contentType: "video/mp4", size: 1024 }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ statusCode: 500 });
  });
});