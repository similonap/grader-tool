import Link from "next/link";
import { notFound } from "next/navigation";
import { computeCourseStats } from "@/lib/courseStats";
import { getCourse } from "@/lib/gradebook";
import { listProjects } from "@/lib/storage";
import { CourseActions } from "./CourseActions";
import { CourseComponents } from "./CourseComponents";
import { CourseStats } from "./CourseStats";
import { GradebookTable } from "./GradebookTable";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;

  const course = await getCourse(courseId);
  if (!course) notFound();

  const projects = await listProjects();
  const stats = computeCourseStats(course);

  const students = [...course.students].sort(
    (a, b) => (a.group ?? "￿").localeCompare(b.group ?? "￿") || a.name.localeCompare(b.name)
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4 border-b border-line pb-7">
        <div>
          <p className="font-mono text-xs text-muted-2">
            <Link href="/" className="hover:text-ink hover:underline">
              Gradebook
            </Link>{" "}
            / {course.label}
          </p>
          <h1 className="mt-2 font-display text-[32px] font-semibold text-ink">{course.label}</h1>
          <p className="mt-1 text-sm text-muted">
            {course.students.length} student{course.students.length === 1 ? "" : "s"} on the list
          </p>
        </div>
        <CourseActions courseId={course.id} label={course.label} />
      </div>

      <div className="space-y-6">
        <CourseComponents
          courseId={course.id}
          components={course.components}
          projects={projects.map((p) => ({ id: p.id, label: p.label }))}
          scored={Object.fromEntries(
            course.components.map((c) => [
              c.key,
              Object.values(course.scores).filter((s) => s[c.key] !== undefined).length,
            ])
          )}
        />

        {students.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2 p-12 text-center">
            <p className="text-sm text-muted">
              No students yet. Use <span className="font-medium text-ink">Import student list</span> above to
              upload the .xlsx export with the Student and Subgroep columns.
            </p>
          </div>
        ) : (
          <>
            <GradebookTable
              // Remount (and so re-read the saved scores) after a bulk change
              // like an import or a clear, which the table's own inputs don't see.
              key={course.updatedAt}
              components={course.components}
              students={students}
              scores={course.scores}
            />
            <CourseStats stats={stats} />
          </>
        )}
      </div>
    </div>
  );
}
