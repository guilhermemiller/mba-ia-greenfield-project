import { NextResponse } from "next/server";
import { upstream } from "@/lib/api/upstream";
import type { ApiErrorEnvelope } from "@/lib/api/contracts";

export async function POST(request: Request) {
  const body = await request.json();

  const { error, response } = await upstream.POST("/auth/resend-confirmation", {
    body,
  });

  if (error) {
    return NextResponse.json(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  // Next.js Route Handlers returning 204 need a specific constructor pattern
  return new NextResponse(null, { status: 204 });
}
