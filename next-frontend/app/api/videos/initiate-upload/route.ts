import { NextResponse } from "next/server";

import type {
  ApiErrorEnvelope,
  InitiateUploadDto,
  InitiateUploadResult,
} from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { statusCode: 401, error: "UNAUTHORIZED", message: "Not authenticated" } satisfies ApiErrorEnvelope,
      { status: 401 },
    );
  }

  const body = (await request.json()) as InitiateUploadDto;

  const { data, error, response } = await upstream.POST(
    "/videos/initiate-upload",
    {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      body: body as never,
    },
  );

  if (error) {
    return NextResponse.json(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json(data as InitiateUploadResult, { status: 201 });
}
