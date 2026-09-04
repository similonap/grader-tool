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

      <div className="mt-4">
        <SolutionWorkspace
          slug={slug}
          solutionId={solutionId}
          solutionLabel={solution.label}
          solutionGroup={solution.group}
          entries={entries}
          gradingKey={gradingKey}
          initialGrading={initialGrading}
          hasAiGatewayKey={aiGatewayConfigured}
          initialModel={project.lastAutogradeModel ?? null}
          initialLanguage={project.lastAutogradeLanguage ?? null}
          initialLocked={solution.locked ?? false}
        />
      </div>
    </div>
  );
}
