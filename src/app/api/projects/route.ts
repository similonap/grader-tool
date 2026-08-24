import { NextResponse } from "next/server";
import { createProject } from "@/lib/storage";

export async function POST(request: Request) {
  const formData = await request.formData();

  const label = (formData.get("label") as string | null)?.trim();
  const starterZip = formData.get("starterZip") as File | null;
  const gradingKey = formData.get("gradingKey") as File | null;

  if (!label) {
    return NextResponse.json({ error: "A label is required." }, { status: 400 });
  }
  if (!starterZip || starterZip.size === 0) {
    return NextResponse.json({ error: "A starter zip file is required." }, { status: 400 });
  }
  if (!gradingKey || gradingKey.size === 0) {
    return NextResponse.json({ error: "A grading key file is required." }, { status: 400 });
  }

  const gradingKeyText = await gradingKey.text();
  try {
    JSON.parse(gradingKeyText);
  } catch {
    return NextResponse.json({ error: "The grading key must be valid JSON." }, { status: 400 });
  }

  const starterZipBuffer = Buffer.from(await starterZip.arrayBuffer());

  try {
    const project = await createProject({
      label,
      starterZipBuffer,
      starterZipName: starterZip.name,
      gradingKeyText,
      gradingKeyName: gradingKey.name,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("Failed to create project", err);
    return NextResponse.json({ error: "Failed to create the grading project." }, { status: 500 });
  }
}
