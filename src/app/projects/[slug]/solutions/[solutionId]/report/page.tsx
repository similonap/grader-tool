import Link from "next/link";
import { notFound } from "next/navigation";
import { allCriterionIds, parseGradingKey } from "@/lib/gradingKey";
import { getGradingKeyRaw, getGradingState, getProject, getSolution } from "@/lib/storage";
import { SolutionReportView } from "./SolutionReportView";

export const dynamic = "force-dynamic";

export default async function SolutionReportPage({
  params,
}: PageProps<"/projects/[slug]/solutions/[solutionId]/report">) {
  const { slug, solutionId } = await params;

  const project = await getProject(slug);
  if (!project) notFound();

  const solution = await getSolution(slug, solutionId);
  if (!solution) notFound();

  const gradingKeyRaw = await getGradingKeyRaw(slug);
  const gradingKey = parseGradingKey(gradingKeyRaw);
  const grading = await getGradingState(slug, solutionId, allCriterionIds(gradingKey));

  return (
    <div>
      <div className="mx-auto max-w-3xl px-6 pt-10">
        <p className="font-mono text-xs text-muted-2">
          <Link href="/" className="hover:text-ink hover:underline">
            Grading projects
          </Link>{" "}
          /{" "}
          <Link href={`/projects/${slug}`} className="hover:text-ink hover:underline">
            {project.label}
          </Link>{" "}
          /{" "}
          <Link href={`/projects/${slug}/solutions/${solutionId}`} className="hover:text-ink hover:underline">
            {solution.label}
          </Link>{" "}
          / Report
        </p>
      </div>
      <SolutionReportView
        slug={slug}
        solutionId={solutionId}
        solutionLabel={solution.label}
        solutionGroup={solution.group}
        projectLabel={project.label}
        gradingKey={gradingKey}
        grading={grading}
      />
    </div>
  );
}
