import Link from "next/link";
import { notFound } from "next/navigation";
import { allCriterionIds, checkedPoints, parseGradingKey, totalPoints } from "@/lib/gradingKey";
import { hasAiGatewayKey } from "@/lib/settings";
import { getGradingKeyRaw, getGradingState, getProject, listSolutions } from "@/lib/storage";
import { DeleteProjectButton } from "./DeleteProjectButton";
import { ProjectRepoButton } from "./ProjectRepoButton";
import { PuntenlijstImportButton } from "./PuntenlijstImportButton";
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
        let graded = false;
        if (hasStructuredGradingKey) {
          const grading = await getGradingState(slug, solution.id, criterionIds);
          grade = { checked: checkedPoints(gradingKey, grading.criteria), total };
          // saveGradingState always bumps updatedAt, and it defaults to the
          // epoch when never saved - so this distinguishes "actually graded"
          // from "every criterion happens to be unchecked".
          graded = Date.parse(grading.updatedAt) > 0;
        }
        return {
          id: solution.id,
          label: solution.label,
          group: solution.group,
          uploadedAtLabel: formatDate(solution.uploadedAt),
          grade,
          graded,
        };
      })
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4 border-b border-line pb-7">
        <div>
          <p className="font-mono text-xs text-muted-2">
            <Link href="/" className="hover:text-ink hover:underline">
              Grading projects
            </Link>{" "}
            / {project.label}
          </p>
          <h1 className="mt-2 font-display text-[32px] font-semibold text-ink">{project.label}</h1>
          <p className="mt-1 text-sm text-muted">Created {formatDate(project.createdAt)}</p>
        </div>
        <div className="flex items-start gap-2">
          <PuntenlijstImportButton slug={slug} />
          <ProjectRepoButton slug={slug} />
          <Link
            href={`/projects/${slug}/grading-key`}
            className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink"
          >
            Grading key
          </Link>
          <a
            href={`/api/projects/${slug}`}
            download={`${slug}.zip`}
            className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-muted-2 hover:text-ink"
          >
            Export project
          </a>
          <DeleteProjectButton slug={slug} label={project.label} />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
        <h2 className="font-display text-lg font-semibold text-ink">Upload a solution</h2>
        <p className="mt-1 text-xs text-muted">
          Optionally put it in a group (one level deep), e.g. a student group.
        </p>
        <UploadSolutionForm slug={slug} existingGroups={groupNames} />
      </div>

      <div className="mt-6">
        <SolutionsTable
          slug={slug}
          solutions={solutionRows}
          existingGroups={groupNames}
          hasAiGatewayKey={aiGatewayConfigured}
          hasStructuredGradingKey={hasStructuredGradingKey}
          initialModel={project.lastAutogradeModel ?? null}
          initialLanguage={project.lastAutogradeLanguage ?? null}
        />
      </div>
    </div>
  );
}
