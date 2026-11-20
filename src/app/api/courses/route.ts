import { NextResponse } from "next/server";
import { createCourse } from "@/lib/gradebook";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "A course name is required." }, { status: 400 });
  }

  try {
    const course = await createCourse(label);
    return NextResponse.json({ course }, { status: 201 });
  } catch (err) {
    console.error("Failed to create course", err);
    return NextResponse.json({ error: "Failed to create the course." }, { status: 500 });
  }
}
