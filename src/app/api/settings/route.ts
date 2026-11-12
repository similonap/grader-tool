import { NextResponse } from "next/server";
import { getAiProvider, hasAiGatewayKey, setAiGatewayKey, setAiProvider } from "@/lib/settings";

async function currentState() {
  return { hasAiGatewayKey: await hasAiGatewayKey(), aiProvider: await getAiProvider() };
}

export async function GET() {
  return NextResponse.json(await currentState());
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { aiGatewayKey?: unknown; aiProvider?: unknown } | null;
  const hasKey = typeof body?.aiGatewayKey === "string";
  const hasProvider = body?.aiProvider === "gateway" || body?.aiProvider === "claude-cli";
  if (!body || typeof body !== "object" || (!hasKey && !hasProvider)) {
    return NextResponse.json(
      { error: 'Expected { aiGatewayKey: string } and/or { aiProvider: "gateway" | "claude-cli" }.' },
      { status: 400 }
    );
  }

  if (hasKey) await setAiGatewayKey(body.aiGatewayKey as string);
  if (hasProvider) await setAiProvider(body.aiProvider as "gateway" | "claude-cli");
  return NextResponse.json(await currentState());
}
