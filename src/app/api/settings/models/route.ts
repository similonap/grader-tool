import { NextResponse } from "next/server";
import { listModels } from "@/lib/aiGateway";
import { getAiAccess } from "@/lib/settings";

export async function GET() {
  const access = await getAiAccess();
  if (!access) {
    return NextResponse.json({ error: "No AI Gateway key configured. Set one in Settings first." }, { status: 400 });
  }

  try {
    const models = await listModels(access);
    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list models.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
