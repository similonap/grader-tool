import { NextResponse } from "next/server";
import { hasAiGatewayKey, setAiGatewayKey } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ hasAiGatewayKey: await hasAiGatewayKey() });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as { aiGatewayKey?: unknown }).aiGatewayKey !== "string") {
    return NextResponse.json({ error: "Expected { aiGatewayKey: string }." }, { status: 400 });
  }

  await setAiGatewayKey((body as { aiGatewayKey: string }).aiGatewayKey);
  return NextResponse.json({ hasAiGatewayKey: await hasAiGatewayKey() });
}
