import Link from "next/link";
import { notFound } from "next/navigation";
import { allCriterionIds, checkedPoints, parseGradingKey, totalPoints } from "@/lib/gradingKey";
import { hasAiGatewayKey } from "@/lib/settings";
import { getGradingKeyRaw, getGradingState, getProject, listSolutions } from "@/lib/storage";
import { DeleteProjectButton } from "./DeleteProjectButton";
import type { SolutionRow } from "./SolutionsTable";
import { SolutionsTable } from "./SolutionsTable";
import { UploadSolutionForm } from "./UploadSolutionForm";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;

  const project = await getProject(slug);
  if (!project) notFound();

  const [gradingKeyRaw, solutions, aiGatewayConfigured] = await Promise.all([
    getGradingKeyRaw(slug),
    listSolutions(slug),
    hasAiGatewayKey(),
  ]);
  const gradingKey = parseGradingKey(gradingKeyRaw);
  const hasStructuredGradingKey = !!gradingKey?.sections?.length;
  const criterionIds = allCriterionIds(gradingKey);
  const total = totalPoints(gradingKey);

  const groupNames = [...new Set(solutions.map((s) => s.group).filter((g): g is string => g !== null))].sort();

  const solutionRows: SolutionRow[] = await Promise.all(
    solutions
      .slice()
      .sort((a, b) => (a.group ?? "￿").localeCompare(b.group ?? "￿") || a.label.localeCompare(b.label))
      .map(async (solution) => {
        let grade: SolutionRow["grade"] = null;
        if (hasStructuredGradingKey) {
          const grading = await getGradingState(slug, solution.id, criterionIds);
          grade = { checked: checkedPoints(gradingKey, grading.criteria), total };
        }
        return {
          id: solution.id,
          label: solution.label,
          group: solution.group,
          uploadedAtLabel: formatDate(solution.uploadedAt),
          grade,
        };
      })
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-500">
            <Link href="/" className="hover:underline">
              Grading projects
            </Link>{" "}
            / {project.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{project.label}</h1>
          <p className="mt-1 text-sm text-zinc-500">Created {formatDate(project.createdAt)}</p>
        </div>
        <div className="flex items-start gap-2">
          <Link
            href={`/projects/${slug}/grading-key`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Grading key
          </Link>
          <a
            href={`/api/projects/${slug}`}
            download={`${slug}.zip`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Export project
          </a>
          <DeleteProjectButton slug={slug} label={project.label} />
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Upload a solution</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Optionally put it in a group (one level deep), e.g. a student group.
        </p>
        <UploadSolutionForm slug={slug} existingGroups={groupNames} />
      </div>

      <div className="mt-6">
        <SolutionsTable
          slug={slug}
          solutions={solutionRows}
          hasAiGatewayKey={aiGatewayConfigured}
          hasStructuredGradingKey={hasStructuredGradingKey}
          initialModel={project.lastAutogradeModel ?? null}
          initialLanguage={project.lastAutogradeLanguage ?? null}
        />
      </div>
    </div>
  );
}
