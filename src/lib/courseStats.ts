import type { ComponentKey, Course, CourseStudent } from "./gradebook";

/** One student's row in the scorebook: their per-component scores and the weighted total. */
export interface StudentResult {
  student: CourseStudent;
  scores: Partial<Record<ComponentKey, number>>;
  /** Weighted total as a percentage (0-100). Missing components count as 0. */
  totalPct: number;
  /** True once every component has a score - only complete students count towards the stats. */
  complete: boolean;
  /** Whether anything at all has been scored for this student. */
  started: boolean;
}

export interface ComponentStat {
  key: ComponentKey;
  label: string;
  weight: number;
  max: number;
  scored: number;
  avgPct: number;
}

export interface CourseStats {
  students: number;
  /** Students counted in the figures below (every component scored). */
  complete: number;
  averagePct: number;
  medianPct: number;
  minPct: number;
  maxPct: number;
  stdDevPct: number;
  /** Share of complete students at >= 50%. */
  passRate: number;
  distribution: { label: string; count: number }[];
  components: ComponentStat[];
  groups: { group: string | null; count: number; avgPct: number }[];
}

/** Final score on the usual /20 scale. */
export function on20(totalPct: number): number {
  return Math.round((totalPct / 5) * 10) / 10;
}

export function studentResults(course: Course): StudentResult[] {
  return course.students.map((student) => {
    const scores = course.scores[student.id] ?? {};
    let totalPct = 0;
    let complete = true;
    let started = false;
    for (const component of course.components) {
      const score = scores[component.key];
      if (score === undefined || component.max <= 0) {
        complete = false;
        continue;
      }
      started = true;
      totalPct += (score / component.max) * component.weight;
    }
    return { student, scores, totalPct, complete, started };
  });
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeCourseStats(course: Course): CourseStats {
  const results = studentResults(course);
  const complete = results.filter((r) => r.complete);
  const totals = complete.map((r) => r.totalPct).sort((a, b) => a - b);

  const average = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const variance =
    totals.length > 0 ? totals.reduce((a, b) => a + (b - average) ** 2, 0) / totals.length : 0;

  // Ten fixed 10%-wide bands; a perfect score lands in the last one.
  const distribution = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i * 10 + 10}`, count: 0 }));
  for (const value of totals) distribution[Math.min(9, Math.max(0, Math.floor(value / 10)))].count++;

  const components: ComponentStat[] = course.components.map((component) => {
    const values = results
      .map((r) => r.scores[component.key])
      .filter((v): v is number => v !== undefined && component.max > 0)
      .map((v) => (v / component.max) * 100);
    return {
      key: component.key,
      label: component.label,
      weight: component.weight,
      max: component.max,
      scored: values.length,
      avgPct: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    };
  });

  const byGroup = new Map<string | null, number[]>();
  for (const r of complete) {
    const list = byGroup.get(r.student.group) ?? [];
    list.push(r.totalPct);
    byGroup.set(r.student.group, list);
  }
  const groups = [...byGroup.entries()]
    .map(([group, list]) => ({
      group,
      count: list.length,
      avgPct: list.reduce((a, b) => a + b, 0) / list.length,
    }))
    .sort((a, b) => b.avgPct - a.avgPct);

  return {
    students: course.students.length,
    complete: complete.length,
    averagePct: average,
    medianPct: median(totals),
    minPct: totals[0] ?? 0,
    maxPct: totals[totals.length - 1] ?? 0,
    stdDevPct: Math.sqrt(variance),
    passRate: totals.length > 0 ? totals.filter((v) => v >= 50).length / totals.length : 0,
    distribution,
    components,
    groups,
  };
}
