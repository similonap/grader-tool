import { allCriterionIds, checkedPoints, criterionId, parseGradingKey, totalPoints } from "./gradingKey";
import { getGradingKeyRaw, getGradingState, listSolutions } from "./storage";

/** Aggregate result for a single grading-key criterion across every graded solution. */
export interface CriterionStat {
  sectionIndex: number;
  sectionId: string;
  sectionTitle: string;
  id: string;
  /** Human-facing id (the key's own id, or a positional fallback). */
  displayId: string;
  description: string;
  points: number;
  /** How many graded solutions have this criterion checked ("answered correctly"). */
  awarded: number;
  /** awarded / gradedCount, in 0..1. 0 when nothing is graded yet. */
  rate: number;
}

export interface SectionStat {
  index: number;
  id: string;
  title: string;
  points: number;
  /** Average points achieved on this section across graded solutions. */
  avgPoints: number;
  /** avgPoints / points, in 0..1. */
  rate: number;
  criteria: CriterionStat[];
}

export interface ScoreBucket {
  label: string;
  count: number;
}

export interface GroupStat {
  group: string | null;
  graded: number;
  avgPoints: number;
  rate: number;
}

export interface ProjectStats {
  totalSolutions: number;
  gradedCount: number;
  ungradedCount: number;
  totalPoints: number;
  /** Average score in points across graded solutions. */
  average: number;
  averagePct: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  /** Fraction of graded solutions scoring >= 50%. */
  passRate: number;
  distribution: ScoreBucket[];
  sections: SectionStat[];
  /** Up to 5 criteria with the lowest success rate (only when something is graded). */
  hardest: CriterionStat[];
  /** Up to 5 criteria with the highest success rate. */
  easiest: CriterionStat[];
  groups: GroupStat[];
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Builds the project-wide grading analysis: per-criterion success rates,
 * per-section and per-group averages, and the score distribution. Returns
 * `null` when the project has no structured grading key (nothing to
 * aggregate against).
 */
export async function computeProjectStats(slug: string): Promise<ProjectStats | null> {
  const gradingKey = parseGradingKey(await getGradingKeyRaw(slug));
  if (!gradingKey?.sections?.length) return null;

  const solutions = await listSolutions(slug);
  const criterionIds = allCriterionIds(gradingKey);
  const total = totalPoints(gradingKey);

  const entries = await Promise.all(
    solutions.map(async (solution) => ({
      solution,
      grading: await getGradingState(slug, solution.id, criterionIds),
    }))
  );
  // Same "actually graded" test the project page uses: saveGradingState
  // always bumps updatedAt, and it defaults to the epoch when never saved.
  const graded = entries.filter((e) => Date.parse(e.grading.updatedAt) > 0);
  const gradedCount = graded.length;

  const sections: SectionStat[] = gradingKey.sections.map((section, si) => {
    const criteriaDefs = section.criteria ?? [];
    const sectionPoints = criteriaDefs.reduce((sum, c) => sum + (c.points ?? 0), 0);
    const sectionTitle = section.title || "Untitled section";
    const sectionId = section.id ?? String(si + 1);

    const criteria: CriterionStat[] = criteriaDefs.map((criterion, ci) => {
      const id = criterionId(section, si, criterion, ci);
      const awarded = graded.reduce((n, e) => n + (e.grading.criteria[id]?.checked ? 1 : 0), 0);
      return {
        sectionIndex: si,
        sectionId,
        sectionTitle,
        id,
        displayId: criterion.id ?? `${si + 1}.${ci + 1}`,
        description: criterion.description ?? "",
        points: criterion.points ?? 0,
        awarded,
        rate: gradedCount > 0 ? awarded / gradedCount : 0,
      };
    });

    const avgPoints =
      gradedCount > 0
        ? graded.reduce((sum, e) => {
            const got = criteriaDefs.reduce(
              (s, c, ci) => s + (e.grading.criteria[criterionId(section, si, c, ci)]?.checked ? c.points ?? 0 : 0),
              0
            );
            return sum + got;
          }, 0) / gradedCount
        : 0;

    return {
      index: si,
      id: sectionId,
      title: sectionTitle,
      points: sectionPoints,
      avgPoints,
      rate: sectionPoints > 0 ? avgPoints / sectionPoints : 0,
      criteria,
    };
  });

  const scores = graded.map((e) => ({
    id: e.solution.id,
    label: e.solution.label,
    group: e.solution.group,
    points: checkedPoints(gradingKey, e.grading.criteria),
  }));

  const pointValues = scores.map((s) => s.points).sort((a, b) => a - b);
  const sum = pointValues.reduce((a, b) => a + b, 0);
  const average = gradedCount > 0 ? sum / gradedCount : 0;
  const variance =
    gradedCount > 0 ? pointValues.reduce((a, b) => a + (b - average) ** 2, 0) / gradedCount : 0;

  // Ten fixed 10%-wide buckets; a perfect score lands in the last one.
  const distribution: ScoreBucket[] = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}–${i * 10 + 10}%`,
    count: 0,
  }));
  for (const value of pointValues) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    const idx = Math.min(9, Math.floor(pct / 10));
    distribution[idx].count++;
  }

  const groupMap = new Map<string | null, number[]>();
  for (const s of scores) {
    const list = groupMap.get(s.group) ?? [];
    list.push(s.points);
    groupMap.set(s.group, list);
  }
  const groups: GroupStat[] = [...groupMap.entries()]
    .map(([group, list]) => {
      const avg = list.reduce((a, b) => a + b, 0) / list.length;
      return { group, graded: list.length, avgPoints: avg, rate: total > 0 ? avg / total : 0 };
    })
    .sort((a, b) => b.rate - a.rate);

  const allCriteria = sections.flatMap((s) => s.criteria);
  const byRate = [...allCriteria].sort((a, b) => a.rate - b.rate || b.points - a.points);

  return {
    totalSolutions: solutions.length,
    gradedCount,
    ungradedCount: solutions.length - gradedCount,
    totalPoints: total,
    average,
    averagePct: total > 0 ? (average / total) * 100 : 0,
    median: median(pointValues),
    min: pointValues[0] ?? 0,
    max: pointValues[pointValues.length - 1] ?? 0,
    stdDev: Math.sqrt(variance),
    passRate:
      gradedCount > 0
        ? pointValues.filter((v) => total > 0 && v / total >= 0.5).length / gradedCount
        : 0,
    distribution,
    sections,
    hardest: gradedCount > 0 ? byRate.slice(0, 5) : [],
    easiest: gradedCount > 0 ? [...byRate].reverse().slice(0, 5) : [],
    groups,
  };
}
