import { NextResponse } from "next/server";
import {
  COMPONENT_KEYS,
  clearComponentScores,
  deleteCourse,
  getCourse,
  updateComponent,
  type ComponentKey,
} from "@/lib/gradebook";

function isComponentKey(value: unknown): value is ComponentKey {
  return typeof value === "string" && (COMPONENT_KEYS as readonly string[]).includes(value);
}

/** A finite, non-negative number, or undefined when the field wasn't sent at all. */
function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a positive number.`);
  }
  return value;
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/courses/[courseId]">) {
  const { courseId } = await ctx.params;
  const course = await getCourse(courseId);
  if (!course) return NextResponse.json({ error: "Unknown course." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    component?: { key?: unknown; projectSlug?: unknown; weight?: unknown; max?: unknown };
    clear?: { key?: unknown };
  } | null;

  try {
    if (body?.component) {
      const { key, projectSlug, weight, max } = body.component;
      if (!isComponentKey(key)) return NextResponse.json({ error: "Unknown component." }, { status: 400 });
      if (projectSlug !== undefined && projectSlug !== null && typeof projectSlug !== "string") {
        return NextResponse.json({ error: "projectSlug must be a string or null." }, { status: 400 });
      }
      const updated = await updateComponent(courseId, key, {
        ...(projectSlug !== undefined ? { projectSlug: (projectSlug as string | null) || null } : {}),
        ...(weight !== undefined ? { weight: optionalNumber(weight, "Weight")! } : {}),
        ...(max !== undefined ? { max: optionalNumber(max, "Max")! } : {}),
      });
      return NextResponse.json({ course: updated });
    }

    if (body?.clear) {
      const { key } = body.clear;
      if (!isComponentKey(key)) return NextResponse.json({ error: "Unknown component." }, { status: 400 });
      const cleared = await clearComponentScores(courseId, key);
      return NextResponse.json({ cleared });
    }

    return NextResponse.json({ error: "Expected a { component } or { clear } patch." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update the course.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/courses/[courseId]">) {
  const { courseId } = await ctx.params;
  const deleted = await deleteCourse(courseId);
  if (!deleted) return NextResponse.json({ error: "Unknown course." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
