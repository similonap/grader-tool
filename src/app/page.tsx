import Link from "next/link";
import { ImportProjectButton } from "./ImportProjectButton";
import { ImportProjectFromGitButton } from "./ImportProjectFromGitButton";
import { listProjects, listSolutions } from "@/lib/storage";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function Home() {
  const projects = await listProjects();

  const withCounts = await Promise.all(
    projects.map(async (project) => ({
      project,
      solutionCount: (await listSolutions(project.id)).length,
    }))
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4 border-b border-line pb-7">
        <div>
          <p className="font-mono text-xs tracking-wide text-muted-2 uppercase">Dashboard</p>
          <h1 className="mt-2.5 font-display text-[32px] font-semibold text-ink">Grading projects</h1>
          <p className="mt-2 max-w-[62ch] text-sm text-muted">
            Each project pairs a starter project with a grading key, then holds the student solutions you upload against it.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <ImportProjectButton />
          <ImportProjectFromGitButton />
        </div>
      </div>

      {withCounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2 p-12 text-center">
          <p className="text-sm text-muted">No grading projects yet.</p>
          <Link
            href="/new"
            className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-105"
          >
            Create your first grading project
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {withCounts.map(({ project, solutionCount }) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="block h-full rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] transition hover:border-line-strong"
              >
                <h2 className="font-display text-lg font-semibold text-ink">{project.label}</h2>
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
    </div>
  );
}
