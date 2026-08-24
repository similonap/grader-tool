export interface GradingKeyCriterion {
  id?: string;
  description?: string;
  points?: number;
}

export interface GradingKeySection {
  id?: string;
  title?: string;
  criteria?: GradingKeyCriterion[];
}

export interface GradingKeyDoc {
  title?: string;
  sections?: GradingKeySection[];
}

export function parseGradingKey(raw: string | null): GradingKeyDoc | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GradingKeyDoc;
  } catch {
    return null;
  }
}

/** Stable id for a criterion, falling back to a positional id when the key omits one. */
export function criterionId(section: GradingKeySection, sectionIndex: number, criterion: GradingKeyCriterion, criterionIndex: number): string {
  return criterion.id ?? `${section.id ?? sectionIndex}-${criterionIndex}`;
}

export function allCriterionIds(doc: GradingKeyDoc | null): string[] {
  if (!doc?.sections) return [];
  const ids: string[] = [];
  doc.sections.forEach((section, si) => {
    (section.criteria ?? []).forEach((criterion, ci) => {
      ids.push(criterionId(section, si, criterion, ci));
    });
  });
  return ids;
}

export function totalPoints(doc: GradingKeyDoc | null): number {
  if (!doc?.sections) return 0;
  return doc.sections.reduce(
    (sum, section) => sum + (section.criteria ?? []).reduce((a, c) => a + (c.points ?? 0), 0),
    0
  );
}

/** Sum of points for every criterion marked `checked` in the given grading state. */
export function checkedPoints(doc: GradingKeyDoc | null, criteria: Record<string, { checked: boolean }>): number {
  if (!doc?.sections) return 0;
  let sum = 0;
  doc.sections.forEach((section, si) => {
    (section.criteria ?? []).forEach((criterion, ci) => {
      const id = criterionId(section, si, criterion, ci);
      if (criteria[id]?.checked) sum += criterion.points ?? 0;
    });
  });
  return sum;
}
