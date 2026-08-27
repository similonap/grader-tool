import Link from "next/link";
import { notFound } from "next/navigation";
import { allCriterionIds, parseGradingKey } from "@/lib/gradingKey";
import { hasAiGatewayKey } from "@/lib/settings";
import { getGradingKeyRaw, getGradingState, getProject, getSolution, getSolutionDiff } from "@/lib/storage";
import type { FileDiffEntry } from "@/lib/types";
import { SolutionWorkspace } from "./SolutionWorkspace";

export const dynamic = "force-dynamic";

export default async function SolutionDiffPage({
  params,
}: PageProps<"/projects/[slug]/solutions/[solutionId]">) {
  const { slug, solutionId } = await params;

  const project = await getProject(slug);
  if (!project) notFound();

  const solution = await getSolution(slug, solutionId);
  if (!solution) notFound();

  const [solutionDiff, gradingKeyRaw, aiGatewayConfigured] = await Promise.all([
    getSolutionDiff(slug, solution),
    getGradingKeyRaw(slug),
    hasAiGatewayKey(),
  ]);
  const gradingKey = parseGradingKey(gradingKeyRaw);
  const initialGrading = await getGradingState(slug, solutionId, allCriterionIds(gradingKey));

  const entries: FileDiffEntry[] = (solutionDiff?.files ?? []).map((f) => ({
    path: f.path,
    status: f.status,
    binary: f.binary,
  }));

  const counts = entries.reduce(
    (acc, e) => {
      acc[e.status] += 1;
      return acc;
    },
    { added: 0, removed: 0, modified: 0, unchanged: 0 }
  );

  return (
    <div className="mx-auto max-w-[110rem] px-6 py-8">
      <p className="font-mono text-xs text-muted-2">
        <Link href="/" className="hover:text-ink hover:underline">
          Grading projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${slug}`} className="hover:text-ink hover:underline">
          {project.label}
        </Link>{" "}
        / {solution.label}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">{solution.label}</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 font-mono text-xs">
            <Badge color="green" label={`${counts.added} added`} />
            <Badge color="amber" label={`${counts.modified} modified`} />
            <Badge color="red" label={`${counts.removed} removed`} />
            <Badge color="zinc" label={`${counts.unchanged} unchanged`} />
          </div>
          <Link
            href={`/projects/${slug}/solutions/${solutionId}/report`}
            className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink"
          >
            View report
          </Link>
        </div>
      </div>
      {solution.group && <p className="mt-1 text-sm text-muted">Group: {solution.group}</p>}

      <div className="mt-6">
        <SolutionWorkspace
          slug={slug}
          solutionId={solutionId}
          entries={entries}
          gradingKey={gradingKey}
          initialGrading={initialGrading}
          hasAiGatewayKey={aiGatewayConfigured}
          initialModel={project.lastAutogradeModel ?? null}
          initialLanguage={project.lastAutogradeLanguage ?? null}
        />
      </div>
    </div>
  );
}

function Badge({ color, label }: { color: "green" | "amber" | "red" | "zinc"; label: string }) {
  const colorClasses = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    zinc: "bg-surface-2 text-muted",
  }[color];
  return <span className={`rounded-md px-2.5 py-1 font-medium ${colorClasses}`}>{label}</span>;
}
