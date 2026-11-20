import { NextResponse } from "next/server";
import { COMPONENT_KEYS, getCourse, importComponentScores, type ComponentKey } from "@/lib/gradebook";

export async function POST(request: Request, ctx: RouteContext<"/api/courses/[courseId]/import">) {
  const { courseId } = await ctx.params;
  const course = await getCourse(courseId);
  if (!course) return NextResponse.json({ error: "Unknown course." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    component?: unknown;
    confirmUnlocked?: unknown;
  } | null;
  const key = body?.component;
  if (typeof key !== "string" || !(COMPONENT_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: "Unknown component." }, { status: 400 });
  }

  try {
    const outcome = await importComponentScores(courseId, key as ComponentKey, body?.confirmUnlocked === true);
    // Nothing was imported yet: the caller has to warn about the unlocked
    // grades and ask again with confirmUnlocked.
    if ("needsConfirmation" in outcome) return NextResponse.json(outcome);
    return NextResponse.json({ result: outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import the scores.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
