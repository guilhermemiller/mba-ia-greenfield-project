import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const cookieMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
    set: (name: string, value: string) => { cookieMap.set(name, value); },
    delete: (name: string) => { cookieMap.delete(name); },
  }),
}));

let POST: (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/videos/[id]/complete/route"));
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

function makeRequest(id: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/videos/${id}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "video-upload-1" }) };

describe("POST /api/videos/[id]/complete", () => {
  it("returns 200 with the processing video view on success", async () => {
    const res = await POST(
      makeRequest("video-upload-1", { parts: [{ partNumber: 1, etag: '"a"' }] }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("processing");
    expect(body.id).toBe("video-1");
  });

  it("returns 400 for incomplete parts (reserved trigger: empty parts array)", async () => {
    const res = await POST(
      makeRequest("video-upload-1", { parts: [] }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "VIDEO_UPLOAD_PARTS_INCOMPLETE" });
  });

  it("returns 401 when not authenticated", async () => {
    cookieMap.clear();
    const res = await POST(
      makeRequest("video-upload-1", { parts: [{ partNumber: 1, etag: '"a"' }] }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});