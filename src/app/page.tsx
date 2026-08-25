import Link from "next/link";
import { ImportProjectButton } from "./ImportProjectButton";
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
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Grading projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Each project pairs a starter project with a grading key, then holds the student solutions you upload against it.
          </p>
        </div>
        <ImportProjectButton />
      </div>

      {withCounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-sm text-zinc-500">No grading projects yet.</p>
          <Link
            href="/new"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
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
                className="block h-full rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm"
              >
                <h2 className="font-medium text-zinc-900">{project.label}</h2>
                <p className="mt-1 text-xs text-zinc-500">Created {formatDate(project.createdAt)}</p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                    {project.environment.projectType}
                  </span>
                  {project.environment.packageManager && (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                      {project.environment.packageManager}
                    </span>
                  )}
                </div>
                <p className="mt-4 text-sm text-zinc-600">
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
