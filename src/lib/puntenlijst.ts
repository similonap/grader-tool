import { parseXlsxFirstSheet } from "./xlsx";

export interface PuntenlijstStudent {
  name: string;
  group: string | null;
}

const NAME_HEADER_CANDIDATES = ["student", "naam", "name"];
// Preference order, not sheet column order - "subgroep" is checked before
// "klasgroep" even though Klasgroep sits to its left in a typical export.
const GROUP_HEADER_CANDIDATES = ["subgroep", "klasgroep", "groep", "group", "klas"];

function findColumn(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = header.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Parses a "puntenlijst" (student roster) .xlsx export into a deduplicated list of students and their group. */
export function parsePuntenlijst(buffer: Buffer): PuntenlijstStudent[] {
  const rows = parseXlsxFirstSheet(buffer);
  if (rows.length === 0) throw new Error("The spreadsheet is empty.");

  const header = rows[0].map((h) => (h ?? "").trim().toLowerCase());
  const nameCol = findColumn(header, NAME_HEADER_CANDIDATES);
  if (nameCol === -1) {
    throw new Error(`Couldn't find a "Student" column in this spreadsheet (saw: ${rows[0].filter(Boolean).join(", ")}).`);
  }
  const groupCol = findColumn(header, GROUP_HEADER_CANDIDATES);

  const byName = new Map<string, PuntenlijstStudent>();
  for (const row of rows.slice(1)) {
    const rawName = row[nameCol]?.trim();
    if (!rawName) continue;
    // Angle-bracketed suffixes are exam-system markers (e.g. a retake
    // indicator), not part of the name, so drop them entirely - but a
    // parenthesized suffix is more often an actual preferred name (e.g.
    // "Vo Trong (Van)"), so keep its contents as a separate word instead.
    const name = rawName
      .replace(/<[^>]*>/g, "")
      .replace(/[()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Subgroep values look like "2PRO_D1@S1" - the "@S1" part is a
    // sub-subgroup/session marker, not meaningful as a group name here.
    const group = groupCol !== -1 ? (row[groupCol]?.trim().replace(/@.*$/, "") || null) : null;
    if (!byName.has(name)) byName.set(name, { name, group });
  }

  return [...byName.values()];
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokensAndVariants(name: string): { tokens: string[]; joinVariants: string[] } {
  const tokens = normalize(name)
    .split(" ")
    .filter((t) => t.length >= 2);
  const joined = tokens.join("");
  const reversed = [...tokens].reverse().join("");
  const variants = new Set([joined, reversed]);
  if (tokens.length > 2) {
    variants.add(tokens[0] + tokens[tokens.length - 1]);
    variants.add(tokens[tokens.length - 1] + tokens[0]);
  }
  return { tokens, joinVariants: [...variants].filter((v) => v.length >= 4) };
}

function scoreAgainstBlob(blob: string, name: string): number {
  const { tokens, joinVariants } = nameTokensAndVariants(name);
  if (tokens.length === 0) return 0;
  if (joinVariants.some((v) => blob.includes(v))) return 1;
  const matched = tokens.filter((t) => blob.includes(t)).length;
  return matched / tokens.length;
}

export interface SolutionMatchCandidate {
  solutionId: string;
  label: string;
  originalFilename: string;
}

export interface SolutionMatch {
  solutionId: string;
  suggestion: { name: string; group: string | null; score: number } | null;
}

const MIN_SCORE = 0.5;

/**
 * Greedily assigns each solution to its best-scoring, not-yet-used student
 * (highest overall pairs first), so two solutions can't both claim the same
 * student. Falls back to no suggestion below MIN_SCORE - the caller always
 * shows this as a human-reviewed proposal, never applies it blindly.
 */
export function matchSolutionsToPuntenlijst(
  solutions: SolutionMatchCandidate[],
  students: PuntenlijstStudent[]
): SolutionMatch[] {
  const pairs: { solutionId: string; student: PuntenlijstStudent; score: number }[] = [];
  for (const solution of solutions) {
    const blob = normalize(`${solution.label} ${solution.originalFilename}`).replace(/ /g, "");
    for (const student of students) {
      const score = scoreAgainstBlob(blob, student.name);
      if (score >= MIN_SCORE) pairs.push({ solutionId: solution.solutionId, student, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedSolutions = new Set<string>();
  const usedStudents = new Set<string>();
  const bestBySolution = new Map<string, { name: string; group: string | null; score: number }>();
  for (const pair of pairs) {
    if (usedSolutions.has(pair.solutionId) || usedStudents.has(pair.student.name)) continue;
    usedSolutions.add(pair.solutionId);
    usedStudents.add(pair.student.name);
    bestBySolution.set(pair.solutionId, { name: pair.student.name, group: pair.student.group, score: pair.score });
  }

  return solutions.map((s) => ({ solutionId: s.solutionId, suggestion: bestBySolution.get(s.solutionId) ?? null }));
}
