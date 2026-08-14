import { NextResponse } from "next/server";

import type { ApiErrorEnvelope, Video } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
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

  const { data, error, response } = await upstream.POST("/videos/{id}/abort", {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    params: { path: { id } },
  });

  if (error) {
    return NextResponse.json(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json(data as Video, { status: 200 });
}