import { on20, type CourseStats as Stats } from "@/lib/courseStats";

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <p className="font-mono text-xs text-muted-2">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function CourseStats({ stats }: { stats: Stats }) {
  if (stats.complete === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
        <h2 className="font-display text-lg font-semibold text-ink">Results</h2>
        <p className="mt-2 text-sm text-muted">
          No student has a score for every component yet. Once they do, the totals, distribution and stats
          appear here.
        </p>
      </div>
    );
  }

  const maxBucket = Math.max(1, ...stats.distribution.map((b) => b.count));

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="font-display text-lg font-semibold text-ink">Results</h2>
      <p className="mt-1 text-xs text-muted">
        Across the {stats.complete} of {stats.students} students with a score for every component. Totals are
        the weighted score on /20.
      </p>

      <div className="mt-5 space-y-8">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
          <StatCard label="Average" value={`${on20(stats.averagePct).toFixed(1)}`} hint={pct(stats.averagePct)} />
          <StatCard label="Pass rate" value={pct(stats.passRate * 100)} hint="scored ≥ 10/20" />
          <StatCard label="Std dev" value={on20(stats.stdDevPct).toFixed(1)} hint="points on /20" />
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">Total score distribution</h3>
          <p className="mt-1 text-xs text-muted">How many students fall in each 10% band of the final score.</p>
          <div className="mt-3 flex items-end gap-0.5 rounded-xl border border-line bg-surface-2 p-4">
            {stats.distribution.map((bucket, i) => (
              <div
                key={bucket.label}
                className="flex flex-1 flex-col items-center gap-1.5"
                title={`${bucket.label}% (${(i * 2).toFixed(0)}–${(i * 2 + 2).toFixed(0)}/20): ${bucket.count} student${
                  bucket.count === 1 ? "" : "s"
                }`}
              >
                <span className="font-mono text-xs text-muted-2">{bucket.count || ""}</span>
                <div
                  className="w-full rounded-t bg-accent"
                  style={{ height: `${(bucket.count / maxBucket) * 110 + 2}px` }}
                />
                <span className="font-mono text-[10px] text-muted-2">{bucket.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-right font-mono text-[10px] text-muted-2">% of the final score</p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">By component</h3>
          <p className="mt-1 text-xs text-muted">
            Average per part, over everyone scored on it - including students who aren&apos;t complete yet.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2">
            {stats.components.map((component) => (
              <div
                key={component.key}
                className="grid grid-cols-[1fr_160px_132px] items-center gap-3.5 border-b border-line px-4 py-3 text-sm last:border-0"
                title={`${component.label}: ${pct(component.avgPct)} average over ${component.scored} student(s)`}
              >
                <span className="truncate text-ink">
                  {component.label}
                  <span className="ml-1.5 font-mono text-xs text-muted-2">{component.weight}%</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, component.avgPct)}%` }}
                  />
                </span>
                <span className="text-right font-mono text-xs text-muted">
                  {((component.avgPct / 100) * component.max).toFixed(1)} / {component.max} · {component.scored}
                </span>
              </div>
            ))}
          </div>
        </section>

        {stats.groups.length > 1 && (
          <section>
            <h3 className="font-display text-base font-semibold text-ink">By group</h3>
            <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2">
              {stats.groups.map((g) => (
                <div
                  key={g.group ?? "__none__"}
                  className="grid grid-cols-[1fr_160px_132px] items-center gap-3.5 border-b border-line px-4 py-3 text-sm last:border-0"
                  title={`${g.group ?? "No group"}: ${on20(g.avgPct).toFixed(1)}/20 average over ${g.count} student(s)`}
                >
                  <span className="truncate text-ink">{g.group ?? <span className="text-muted-2">No group</span>}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(100, g.avgPct)}%` }}
                    />
                  </span>
                  <span className="text-right font-mono text-xs text-muted">
                    {on20(g.avgPct).toFixed(1)} / 20 · {g.count}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
