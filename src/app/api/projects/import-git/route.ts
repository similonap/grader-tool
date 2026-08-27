import { NextResponse } from "next/server";
import { importProjectFromGit } from "@/lib/storage";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { remoteUrl?: unknown } | null;
  const remoteUrl = typeof body?.remoteUrl === "string" ? body.remoteUrl.trim() : "";
  if (!remoteUrl) {
    return NextResponse.json({ error: "Expected { remoteUrl: string }." }, { status: 400 });
  }

  try {
    const project = await importProjectFromGit(remoteUrl);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("Failed to import project from git", err);
    const message = err instanceof Error ? err.message : "Failed to import the project.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
