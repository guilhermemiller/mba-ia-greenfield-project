import { NextResponse } from "next/server";

import type { ApiErrorEnvelope } from "@/lib/api/contracts";
// import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session.isLoggedIn) {
    return NextResponse.json(
      { statusCode: 401, error: "UNAUTHORIZED", message: "Not authenticated" } satisfies ApiErrorEnvelope,
      { status: 401 },
    );
  }

  const { id } = await params;
  const url = new URL(request.url);
  const partNumber = url.searchParams.get("partNumber");
  if (!partNumber) {
    return NextResponse.json(
      { statusCode: 400, error: "VALIDATION_ERROR", message: "partNumber is required" } satisfies ApiErrorEnvelope,
      { status: 400 },
    );
  }

  // The upstream presign-part endpoint returns a raw string (the presigned URL),
  // not JSON. openapi-fetch tries to parse it as JSON and fails.
  // Use native fetch with the access token directly.
  const upstreamUrl = `${env.API_URL}/videos/${encodeURIComponent(id)}/presign-part?partNumber=${encodeURIComponent(partNumber)}`;
  const res = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "text/plain",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorJson: ApiErrorEnvelope;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      errorJson = {
        statusCode: res.status,
        error: "UPSTREAM_ERROR",
        message: errorText || "Failed to get presigned URL",
      };
    }
    return NextResponse.json(errorJson, { status: res.status });
  }

  const presignedUrl = await res.text();
  return NextResponse.json({ partUrl: presignedUrl }, { status: 200 });
}