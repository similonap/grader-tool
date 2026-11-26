import { ACCENT_RAMP, fmtPts, renderDescription } from "@/lib/gradingKeyDisplay";
import type { ReactNode } from "react";
import { ALPHA_THRESHOLD, computeProjectStats, RIR_THRESHOLD, type CriterionStat } from "@/lib/projectStats";

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Red → amber → emerald by how many students got a criterion right. */
function rateColor(rate: number): { bar: string; text: string } {
  if (rate >= 0.7) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (rate >= 0.4) return { bar: "bg-amber-500", text: "text-amber-600" };
  return { bar: "bg-red-500", text: "text-red-600" };
}

/** "i" button that opens an explanation in a native popover (closes on outside click / Esc). */
function InfoButton({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={`What is ${label}?`}
        className="ml-1.5 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-line-strong align-middle font-mono text-[10px] font-semibold leading-none text-muted-2 hover:border-ink hover:text-ink"
      >
        i
      </button>
      <div
        id={id}
        popover="auto"
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-5 text-left font-sans text-sm font-normal whitespace-normal text-ink shadow-[var(--shadow)] backdrop:bg-black/20"
      >
        <p className="font-display text-base font-semibold">{label}</p>
        <div className="mt-2 space-y-2 text-muted">{children}</div>
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          className="mt-4 rounded-lg border border-line px-3 py-1 text-xs text-ink hover:bg-surface-2"
        >
          Close
        </button>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
  info,
  valueClass = "text-ink",
}: {
  label: string;
  value: string;
  hint?: string;
  info?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <p className="font-mono text-xs text-muted-2">
        {label}
        {info}
      </p>
      <p className={`mt-1 font-display text-2xl font-semibold ${valueClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function CriterionRow({ c }: { c: CriterionStat }) {
  const color = rateColor(c.rate);
  return (
    <div className="grid grid-cols-[46px_1fr_140px] items-center gap-3.5 border-b border-line px-4 py-2.5 text-sm last:border-0">
      <span className="pt-0.5 font-mono text-xs text-muted-2">{c.displayId}</span>
      <span className="min-w-0 text-ink">
        {c.description ? renderDescription(c.description) : "—"}
        <span className="ml-1.5 font-mono text-xs text-muted-2">({fmtPts(c.points)} pt)</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
          <span className={`block h-full rounded-full ${color.bar}`} style={{ width: pct(c.rate) }} />
        </span>
        <span className={`w-16 shrink-0 text-right font-mono text-xs font-semibold ${color.text}`}>
          {pct(c.rate)}
        </span>
      </span>
    </div>
  );
}

export async function ProjectAnalysis({ slug }: { slug: string }) {
  const stats = await computeProjectStats(slug);
  if (!stats) return null;

  const hasGraded = stats.gradedCount > 0;
  const maxBucket = Math.max(1, ...stats.distribution.map((b) => b.count));

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="font-display text-lg font-semibold text-ink">Analysis</h2>
      <p className="mt-1 text-xs text-muted">
        Aggregated across {stats.gradedCount} graded solution{stats.gradedCount === 1 ? "" : "s"}
        {stats.ungradedCount > 0 && ` (${stats.ungradedCount} not yet graded)`}. Out of{" "}
        {fmtPts(stats.totalPoints)} points total.
      </p>

      {!hasGraded ? (
        <p className="mt-4 text-sm text-muted">
          No solutions have been graded yet. Grade some solutions (manually or with autograde) and this pane
          will fill in.
        </p>
      ) : (
        <div className="mt-5 space-y-8">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Average"
              value={`${fmtPts(stats.average)} / ${fmtPts(stats.totalPoints)}`}
              hint={pct(stats.averagePct / 100)}
            />
            <StatCard label="Pass rate" value={pct(stats.passRate)} hint="scored ≥ 50%" />
            <StatCard
              label="Std dev"
              value={fmtPts(stats.stdDev)}
              hint="points"
              info={
                <InfoButton id="info-stddev" label="Standard deviation">
                  <p>
                    How far scores typically sit from the average, in points. Small means most students scored
                    close to the average; large means scores are spread out.
                  </p>
                  <p>
                    Roughly two thirds of students score within one standard deviation of the average (here{" "}
                    {fmtPts(Math.max(0, stats.average - stats.stdDev))}–
                    {fmtPts(Math.min(stats.totalPoints, stats.average + stats.stdDev))} points), if scores are
                    roughly bell-shaped.
                  </p>
                </InfoButton>
              }
            />
            <StatCard
              label="Cronbach's α"
              value={stats.cronbachAlpha === null ? "—" : stats.cronbachAlpha.toFixed(2)}
              hint="over the questions"
              valueClass={
                stats.cronbachAlpha === null
                  ? "text-muted-2"
                  : stats.cronbachAlpha >= ALPHA_THRESHOLD
                    ? "text-emerald-700"
                    : "text-red-600"
              }
              info={
                <InfoButton id="info-alpha" label="Cronbach's α">
                  <p>
                    How consistently the questions measure the same thing: do students who score well on one
                    question also score well on the others?
                  </p>
                  <p>
                    It runs from 0 to 1 (it can dip below 0). Rough guide: ≥ 0.8 good, 0.7–0.8 acceptable, below{" "}
                    {ALPHA_THRESHOLD.toFixed(1)} the total score is not a reliable measure. Green when ≥{" "}
                    {ALPHA_THRESHOLD.toFixed(2)}.
                  </p>
                  <p>Needs at least 2 questions and 2 graded solutions.</p>
                </InfoButton>
              }
            />
          </section>

          <section>
            <h3 className="font-display text-base font-semibold text-ink">Score distribution</h3>
            <p className="mt-1 text-xs text-muted">How many solutions fall in each score band (% of total points).</p>
            <div className="mt-3 flex items-end gap-2 rounded-xl border border-line bg-surface-2 p-4">
              {stats.distribution.map((bucket) => (
                <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="font-mono text-xs text-muted-2">{bucket.count || ""}</span>
                  <div
                    className="w-full rounded-t bg-accent"
                    style={{ height: `${(bucket.count / maxBucket) * 110 + 2}px` }}
                  />
                  <span className="font-mono text-[10px] text-muted-2">{bucket.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-display text-base font-semibold text-ink">By section</h3>
            <p className="mt-1 text-xs text-muted">
              p = average share of the points earned. Rir = correlation with the rest of the test; green when ≥{" "}
              {RIR_THRESHOLD.toFixed(2)}.
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface-2">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-xs text-muted-2">
                    <th className="px-4 py-2 font-medium">Section</th>
                    <th className="w-40 px-4 py-2 font-medium">Score</th>
                    <th className="px-4 py-2 text-right font-medium">Avg points</th>
                    <th className="whitespace-nowrap px-4 py-2 text-right font-medium">
                      p
                      <InfoButton id="info-p" label="p-value">
                        <p>
                          The average share of this question&apos;s points that students earned, from 0 (nobody
                          scored) to 1 (everyone got full marks).
                        </p>
                        <p>Very low means the question was hard; very high means it was easy.</p>
                      </InfoButton>
                    </th>
                    <th className="whitespace-nowrap px-4 py-2 text-right font-medium">
                      Rir
                      <InfoButton id="info-rir" label="Rir (item-rest correlation)">
                        <p>
                          How well this question&apos;s score agrees with the student&apos;s score on all the other
                          questions. Higher means the question separates strong from weak students well.
                        </p>
                        <p>
                          Green when ≥ {RIR_THRESHOLD.toFixed(2)}, red below. A red question may be unclear, graded
                          against the wrong answer, or measure something else.
                        </p>
                      </InfoButton>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sections.map((section) => {
                    const color = ACCENT_RAMP[section.index % ACCENT_RAMP.length];
                    return (
                      <tr key={section.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
                            <span className="text-ink">
                              <span className="font-mono text-xs text-muted-2">{section.id}</span> {section.title}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block h-2 overflow-hidden rounded-full bg-surface">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: pct(section.rate), background: color }}
                            />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-muted">
                          {fmtPts(section.avgPoints)} / {fmtPts(section.points)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                          {section.rate.toFixed(2)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono text-xs font-semibold ${
                            section.rir === null
                              ? "text-muted-2"
                              : section.rir >= RIR_THRESHOLD
                                ? "text-emerald-700"
                                : "text-red-600"
                          }`}
                        >
                          {section.rir === null ? "—" : section.rir.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Hardest criteria</h3>
              <p className="mt-1 text-xs text-muted">Lowest share of graded solutions that got them.</p>
              <ul className="mt-3 space-y-2">
                {stats.hardest.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm"
                  >
                    <span className="min-w-0 text-ink">
                      <span className="font-mono text-xs text-muted-2">{c.displayId}</span>{" "}
                      {c.description ? renderDescription(c.description) : "—"}
                    </span>
                    <span className={`shrink-0 font-mono text-xs font-semibold ${rateColor(c.rate).text}`}>
                      {pct(c.rate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Easiest criteria</h3>
              <p className="mt-1 text-xs text-muted">Highest share of graded solutions that got them.</p>
              <ul className="mt-3 space-y-2">
                {stats.easiest.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm"
                  >
                    <span className="min-w-0 text-ink">
                      <span className="font-mono text-xs text-muted-2">{c.displayId}</span>{" "}
                      {c.description ? renderDescription(c.description) : "—"}
                    </span>
                    <span className={`shrink-0 font-mono text-xs font-semibold ${rateColor(c.rate).text}`}>
                      {pct(c.rate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section>
            <h3 className="font-display text-base font-semibold text-ink">Every criterion</h3>
            <p className="mt-1 text-xs text-muted">
              Percentage of graded solutions that earned each criterion.
            </p>
            <div className="mt-3 space-y-4">
              {stats.sections.map((section) => {
                const color = ACCENT_RAMP[section.index % ACCENT_RAMP.length];
                return (
                  <details
                    key={section.id}
                    className="group overflow-hidden rounded-xl border border-line bg-surface-2"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface font-mono text-xs font-semibold"
                        style={{ color }}
                      >
                        {section.id}
                      </span>
                      <h4 className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-ink">
                        {section.title}
                      </h4>
                      <span className="shrink-0 font-mono text-xs text-muted-2">avg {pct(section.rate)}</span>
                      <span className="shrink-0 text-xs text-muted-2 transition-transform group-open:rotate-90">
                        ▸
                      </span>
                    </summary>
                    <div className="border-t border-line">
                      {section.criteria.map((c) => (
                        <CriterionRow key={c.id} c={c} />
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>

          {stats.groups.length > 1 && (
            <section>
              <h3 className="font-display text-base font-semibold text-ink">By group</h3>
              <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2">
                {stats.groups.map((g) => (
                  <div
                    key={g.group ?? "__none__"}
                    className="grid grid-cols-[1fr_160px_120px] items-center gap-3.5 border-b border-line px-4 py-3 text-sm last:border-0"
                  >
                    <span className="truncate text-ink">
                      {g.group ?? <span className="text-muted-2">No group</span>}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface">
                      <span className="block h-full rounded-full bg-accent" style={{ width: pct(g.rate) }} />
                    </span>
                    <span className="text-right font-mono text-xs text-muted">
                      {fmtPts(g.avgPoints)} / {fmtPts(stats.totalPoints)} · {g.graded}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
