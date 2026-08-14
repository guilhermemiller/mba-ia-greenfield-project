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
  ({ POST } = await import("@/app/api/videos/[id]/abort/route"));
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

const ctx = { params: Promise.resolve({ id: "video-upload-1" }) };

describe("POST /api/videos/[id]/abort", () => {
  it("returns 200 with a failed video view on success", async () => {
    const res = await POST(
      new Request("http://localhost/api/videos/video-upload-1/abort", {
        method: "POST",
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("failed");
  });

  it("returns 401 when not authenticated", async () => {
    cookieMap.clear();
    const res = await POST(
      new Request("http://localhost/api/videos/video-upload-1/abort", {
        method: "POST",
      }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});