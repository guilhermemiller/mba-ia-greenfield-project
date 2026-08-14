import { NextResponse } from "next/server";

import type { LoginDto, LoginTokenPair, ApiErrorEnvelope } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { setSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = (await request.json()) as LoginDto;

  let data, error, response;
  try {
    const upstreamRes = await upstream.POST("/auth/login", {
      body: body as never,
    });
    data = upstreamRes.data;
    error = upstreamRes.error;
    response = upstreamRes.response;
    
    if (error) {
      return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
        status: response.status,
      });
    }
  } catch (err: any) {
    console.error("Upstream login failed completely:", err);
    return NextResponse.json(
      { statusCode: 500, message: "Erro de comunicação com o servidor", error: "Internal Server Error" },
      { status: 500 }
    );
  }

  const tokens = data as LoginTokenPair;

  // Seal tokens into the iron-session cookie — tokens never cross to the browser.
  await setSession({
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    userId: "",
    email: (body as Record<string, string>).email ?? "",
    channelSlug: "",
  });

  // FE-facing body omits access_token / refresh_token (per API Contract).
  return NextResponse.json({}, { status: 200 });
}
