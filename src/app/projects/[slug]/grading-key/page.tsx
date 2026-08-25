import Link from "next/link";
import { notFound } from "next/navigation";
import { parseGradingKey, totalPoints } from "@/lib/gradingKey";
import { getGradingKeyRaw, getProject } from "@/lib/storage";
import { ReplaceGradingKeyForm } from "./ReplaceGradingKeyForm";

export const dynamic = "force-dynamic";

export default async function GradingKeyPage({ params }: PageProps<"/projects/[slug]/grading-key">) {
  const { slug } = await params;

  const project = await getProject(slug);
  if (!project) notFound();

  const gradingKeyRaw = await getGradingKeyRaw(slug);
  const gradingKey = parseGradingKey(gradingKeyRaw);
  const hasStructuredGradingKey = !!gradingKey?.sections?.length;
  const total = totalPoints(gradingKey);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs text-zinc-500">
          <Link href="/" className="hover:underline">
            Grading projects
          </Link>{" "}
          /{" "}
          <Link href={`/projects/${slug}`} className="hover:underline">
            {project.label}
          </Link>{" "}
          / Grading key
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Grading key</h1>
        <p className="mt-1 text-sm text-zinc-500">{project.gradingKeyName}</p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Replace grading key</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Upload a new grading key JSON file to replace this project&apos;s current one. Existing solutions and any
          grading already given are kept as-is, but will refer to the old criteria until re-graded.
        </p>
        <ReplaceGradingKeyForm slug={slug} />
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">{gradingKey?.title || "Criteria"}</h2>
          {hasStructuredGradingKey && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
              {total} pts total
            </span>
          )}
        </div>

        {!gradingKeyRaw ? (
          <p className="mt-3 text-sm text-zinc-500">No grading key found for this project.</p>
        ) : !gradingKey ? (
          <>
            <p className="mt-3 text-sm text-red-600">
              The stored grading key isn&apos;t valid JSON and can&apos;t be displayed.
            </p>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
              {gradingKeyRaw}
            </pre>
          </>
        ) : !hasStructuredGradingKey ? (
          <>
            <p className="mt-3 text-sm text-zinc-500">
              This grading key isn&apos;t structured into sections and criteria, so it can&apos;t be visualized as a
              checklist (and autograding needs that shape). Here&apos;s the raw content:
            </p>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
              {JSON.stringify(gradingKey, null, 2)}
            </pre>
          </>
        ) : (
          <div className="mt-4 space-y-5">
            {gradingKey.sections!.map((section, si) => {
              const sectionTotal = (section.criteria ?? []).reduce((sum, c) => sum + (c.points ?? 0), 0);
              return (
                <div key={section.id ?? si}>
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-200 pb-1.5">
                    <h3 className="text-sm font-medium text-zinc-900">
                      {section.id ? `${section.id}. ` : ""}
                      {section.title || "Untitled section"}
                    </h3>
                    <span className="text-xs text-zinc-500">{sectionTotal} pts</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {(section.criteria ?? []).map((criterion, ci) => (
                      <li key={criterion.id ?? ci} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-zinc-700">
                          {criterion.id && (
                            <span className="mr-1.5 font-mono text-xs text-zinc-400">{criterion.id}</span>
                          )}
                          {criterion.description || "—"}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">{criterion.points ?? 0} pts</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
