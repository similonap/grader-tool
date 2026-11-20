import Link from "next/link";
import { ImportProjectButton } from "./ImportProjectButton";
import { ImportProjectFromGitButton } from "./ImportProjectFromGitButton";
import { NewCourseForm } from "./courses/NewCourseForm";
import { computeCourseStats, on20 } from "@/lib/courseStats";
import { listCourses } from "@/lib/gradebook";
import { listProjects, listSolutions } from "@/lib/storage";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const CARD = "block h-full rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] transition hover:border-line-strong";
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
const EMPTY = "rounded-2xl border border-dashed border-line-strong bg-surface-2 p-12 text-center";

export default async function Home() {
  const [projects, courses] = await Promise.all([listProjects(), listCourses()]);

  // Hovering a gradebook card lights up the grading projects its components
  // are linked to - one generated :has() rule per pair, no client JS.
  const highlightCss = courses
    .flatMap((course) =>
      [...new Set(course.components.map((c) => c.projectSlug).filter(Boolean))].map(
        (slug) => `[data-home]:has([data-course="${course.id}"]:hover) [data-project="${slug}"]`
      )
    )
    .join(",");

  const withCounts = await Promise.all(
    projects.map(async (project) => ({
      project,
      solutionCount: (await listSolutions(project.id)).length,
    }))
  );

  return (
    <div data-home className="mx-auto max-w-6xl px-6 py-10">
      {highlightCss && (
        <style>{`${highlightCss}{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft-2)}`}</style>
      )}
      <section>
        <div className="mb-8 flex items-start justify-between gap-4 border-b border-line pb-7">
          <div>
            <h1 className="font-display text-[32px] font-semibold text-ink">Grading projects</h1>
            <p className="mt-2 max-w-[62ch] text-sm text-muted">
              Each project pairs a starter project with a grading key, then holds the student solutions you upload against it.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <ImportProjectButton />
            <ImportProjectFromGitButton />
            <Link
              href="/new"
              className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:brightness-105"
            >
              New grading project
            </Link>
          </div>
        </div>

        {withCounts.length === 0 ? (
          <div className={EMPTY}>
            <p className="text-sm text-muted">No grading projects yet.</p>
            <Link
              href="/new"
              className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-105"
            >
              Create your first grading project
            </Link>
          </div>
        ) : (
          <ul className={GRID}>
            {withCounts.map(({ project, solutionCount }) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} data-project={project.id} className={CARD}>
                  <h3 className="font-display text-lg font-semibold text-ink">{project.label}</h3>
                  <p className="mt-1 font-mono text-xs text-muted-2">Created {formatDate(project.createdAt)}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="rounded-md bg-surface-2 px-2.5 py-0.5 font-mono text-xs font-medium text-muted">
                      {project.environment.projectType}
                    </span>
                    {project.environment.packageManager && (
                      <span className="rounded-md bg-surface-2 px-2.5 py-0.5 font-mono text-xs font-medium text-muted">
                        {project.environment.packageManager}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-muted">
                    {solutionCount} solution{solutionCount === 1 ? "" : "s"} uploaded
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14">
        <div className="mb-8 flex items-start justify-between gap-4 border-b border-line pb-7">
          <div>
            <h2 className="font-display text-[32px] font-semibold text-ink">Gradebook</h2>
            <p className="mt-2 max-w-[62ch] text-sm text-muted">
              A course holds one year&apos;s student list and their scores for the interim test, the project and
              the exam, pulled in from the grading projects.
            </p>
          </div>
          <NewCourseForm />
        </div>

        {courses.length === 0 ? (
          <div className={EMPTY}>
            <p className="text-sm text-muted">No gradebooks yet. Use <strong>New gradebook</strong> to start one.</p>
          </div>
        ) : (
          <ul className={GRID}>
            {courses.map((course) => {
              const stats = computeCourseStats(course);
              return (
                <li key={course.id}>
                  <Link href={`/courses/${course.id}`} data-course={course.id} className={CARD}>
                    <h3 className="font-display text-lg font-semibold text-ink">{course.label}</h3>
                    <p className="mt-1 font-mono text-xs text-muted-2">
                      {new Date(course.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </p>
                    <p className="mt-4 text-sm text-muted">
                      {stats.students} student{stats.students === 1 ? "" : "s"} · {stats.complete} fully scored
                    </p>
                    {stats.complete > 0 && (
                      <p className="mt-1 font-mono text-xs text-muted-2">
                        average {on20(stats.averagePct).toFixed(1)}/20
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
