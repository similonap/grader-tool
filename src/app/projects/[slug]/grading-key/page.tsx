import Link from "next/link";
import { notFound } from "next/navigation";
import { parseGradingKey, totalPoints } from "@/lib/gradingKey";
import { ACCENT_RAMP, fmtPts as fmt, renderDescription } from "@/lib/gradingKeyDisplay";
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
  const sections = (gradingKey?.sections ?? []).map((section, si) => ({
    section,
    si,
    total: (section.criteria ?? []).reduce((sum, c) => sum + (c.points ?? 0), 0),
    color: ACCENT_RAMP[si % ACCENT_RAMP.length],
  }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 border-b border-line pb-7">
        <p className="font-mono text-xs text-muted-2">
          <Link href="/" className="hover:text-ink hover:underline">
            Grading projects
          </Link>{" "}
          /{" "}
          <Link href={`/projects/${slug}`} className="hover:text-ink hover:underline">
            {project.label}
          </Link>{" "}
          / Grading key
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-balance font-display text-[32px] font-semibold leading-tight text-ink">
            {gradingKey?.title || "Grading key"}
          </h1>
          {hasStructuredGradingKey && (
            <span className="shrink-0 rounded-md bg-accent-soft px-2.5 py-1 font-mono text-sm font-semibold text-accent-ink">
              {fmt(total)} pt total
            </span>
          )}
        </div>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{project.gradingKeyName}</p>

        {hasStructuredGradingKey && (
          <div className="mt-6 flex flex-col gap-2.5">
            <div className="flex h-[26px] w-full overflow-hidden rounded-lg border border-line">
              {sections.map(({ section, si, total: sectionTotal, color }) => {
                const pct = total > 0 ? (sectionTotal / total) * 100 : 0;
                return (
                  <a
                    key={section.id ?? si}
                    href={`#section-${section.id ?? si}`}
                    title={`${section.title ?? "Untitled section"} — ${fmt(sectionTotal)} pts (${Math.round(pct)}%)`}
                    style={{ width: `${pct}%`, background: color }}
                    className="flex items-center justify-center border-r border-paper/30 font-mono text-[11px] font-semibold text-white last:border-r-0"
                  >
                    {pct > 6 ? (section.id ?? si + 1) : ""}
                  </a>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-xs text-muted">
              {sections.map(({ section, si, total: sectionTotal, color }) => (
                <a key={section.id ?? si} href={`#section-${section.id ?? si}`} className="flex items-center gap-1.5 hover:text-ink">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
                  {section.id ?? si + 1} · {section.title ?? "Untitled section"} ({fmt(sectionTotal)})
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2 p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Replace grading key</h2>
        <p className="mt-1 text-xs text-muted">
          Upload a new grading key JSON file to replace this project&apos;s current one. Existing solutions and any
          grading already given are kept as-is, but will refer to the old criteria until re-graded.
        </p>
        <ReplaceGradingKeyForm slug={slug} />
      </div>

      {!gradingKeyRaw ? (
        <p className="mt-6 text-sm text-muted">No grading key found for this project.</p>
      ) : !gradingKey ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-red-600">The stored grading key isn&apos;t valid JSON and can&apos;t be displayed.</p>
          <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-surface-2 p-3 text-xs text-muted">{gradingKeyRaw}</pre>
        </div>
      ) : !hasStructuredGradingKey ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-muted">
            This grading key isn&apos;t structured into sections and criteria, so it can&apos;t be visualized as a
            checklist (and autograding needs that shape). Here&apos;s the raw content:
          </p>
          <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-surface-2 p-3 text-xs text-muted">
            {JSON.stringify(gradingKey, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {sections.map(({ section, si, total: sectionTotal, color }) => (
            <div key={section.id ?? si} id={`section-${section.id ?? si}`} className="scroll-mt-20 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
              <div className="flex items-center gap-3.5 border-b border-line px-5 py-4">
                <div
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-2 font-mono text-sm font-semibold"
                  style={{ color }}
                >
                  {section.id ?? si + 1}
                </div>
                <h3 className="min-w-0 flex-1 font-display text-lg font-semibold leading-tight text-ink">
                  {section.title || "Untitled section"}
                </h3>
                <span className="shrink-0 rounded-md border border-line bg-surface-2 px-2.5 py-1 font-mono text-xs text-muted">
                  <strong className="font-semibold text-ink">{fmt(sectionTotal)}</strong> pt
                </span>
              </div>

              <div className="flex flex-col">
                {(section.criteria ?? []).map((criterion, ci) => (
                  <div
                    key={criterion.id ?? ci}
                    className="grid grid-cols-[42px_1fr_56px] items-start gap-3.5 border-b border-line px-5 py-3 text-sm last:border-0"
                  >
                    <span className="pt-0.5 font-mono text-xs text-muted-2">{criterion.id ?? ci + 1}</span>
                    <span className="text-ink">{criterion.description ? renderDescription(criterion.description) : "—"}</span>
                    <span className="justify-self-end whitespace-nowrap rounded-md bg-accent-soft px-1.5 py-0.5 text-right font-mono text-xs font-semibold text-accent-ink">
                      {fmt(criterion.points ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
