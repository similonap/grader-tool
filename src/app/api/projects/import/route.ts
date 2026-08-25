import { NextResponse } from "next/server";
import { importProject } from "@/lib/storage";

export async function POST(request: Request) {
  const formData = await request.formData();

  const projectZip = formData.get("projectZip") as File | null;
  if (!projectZip || projectZip.size === 0) {
    return NextResponse.json({ error: "A project export zip file is required." }, { status: 400 });
  }

  const zipBuffer = Buffer.from(await projectZip.arrayBuffer());

  try {
    const project = await importProject(zipBuffer);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("Failed to import project", err);
    const message = err instanceof Error ? err.message : "Failed to import the project.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
