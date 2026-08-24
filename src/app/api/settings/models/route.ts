import { NextResponse } from "next/server";
import { listGatewayModels } from "@/lib/aiGateway";
import { getAiGatewayKey } from "@/lib/settings";

export async function GET() {
  const apiKey = await getAiGatewayKey();
  if (!apiKey) {
    return NextResponse.json({ error: "No AI Gateway key configured. Set one in Settings first." }, { status: 400 });
  }

  try {
    const models = await listGatewayModels(apiKey);
    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list models.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
