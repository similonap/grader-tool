import fs from "node:fs/promises";
import path from "node:path";
import { allCriterionIds, checkedPoints, parseGradingKey, totalPoints } from "./gradingKey";
import { matchSolutionsToPuntenlijst } from "./puntenlijst";
import { uniqueSlug } from "./slug";
import { DATA_ROOT, getGradingKeyRaw, getGradingState, listSolutions } from "./storage";

/**
 * The scorebook: one course per academic year, holding a student roster
 * (imported from the school's .xlsx export), the weighted components the
 * final score is built from, and each student's score per component.
 *
 * Stored as a single JSON file per course under data/courses/, alongside
 * (but deliberately separate from) the grading projects, which stay the
 * source of truth for how an individual exam was graded.
 */

export const COMPONENT_KEYS = ["toets", "project", "exam"] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export interface CourseComponent {
  key: ComponentKey;
  label: string;
  /** Share of the final score, in percent. The three components normally add up to 100. */
  weight: number;
  /** Scale this component is scored on (20 = the usual Flemish /20). */
  max: number;
  /** Grading project (exam) whose results can be pulled into this component. */
  projectSlug: string | null;
}

export interface CourseStudent {
  /** Student number from the roster when present, else a slug of the name. Stable across re-imports, so scores survive one. */
  id: string;
  name: string;
  group: string | null;
  email: string | null;
  /** "Vrijstelling" column, e.g. "EVK" - shown as a badge, never auto-applied. */
  exemption: string | null;
}

export interface Course {
  id: string;
  label: string;
  createdAt: string;
  /** Stamped on every write; the scorebook table keys off it so a bulk change re-renders its inputs. */
  updatedAt?: string;
  components: CourseComponent[];
  students: CourseStudent[];
  /** studentId -> component key -> score, in that component's own points (0..max). */
  scores: Record<string, Partial<Record<ComponentKey, number>>>;
}

export const DEFAULT_COMPONENTS: CourseComponent[] = [
  { key: "toets", label: "Tussentijdse toets", weight: 30, max: 20, projectSlug: null },
  { key: "project", label: "Project", weight: 30, max: 20, projectSlug: null },
  { key: "exam", label: "Examen", weight: 40, max: 20, projectSlug: null },
];

const COURSES_DIR = path.join(DATA_ROOT, "courses");

function coursePath(id: string): string {
  return path.join(COURSES_DIR, `${id}.json`);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function writeCourse(course: Course): Promise<void> {
  await fs.mkdir(COURSES_DIR, { recursive: true });
  course.updatedAt = new Date().toISOString();
  await fs.writeFile(coursePath(course.id), JSON.stringify(course, null, 2), "utf8");
}

export async function getCourse(id: string): Promise<Course | null> {
  try {
    return JSON.parse(await fs.readFile(coursePath(id), "utf8")) as Course;
  } catch {
    return null;
  }
}

export async function listCourses(): Promise<Course[]> {
  await fs.mkdir(COURSES_DIR, { recursive: true });
  const names = (await fs.readdir(COURSES_DIR)).filter((n) => n.endsWith(".json"));
  const courses = (await Promise.all(names.map((n) => getCourse(n.replace(/\.json$/, ""))))).filter(
    (c): c is Course => c !== null
  );
  courses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return courses;
}

export async function createCourse(label: string): Promise<Course> {
  await fs.mkdir(COURSES_DIR, { recursive: true });
  const id = await uniqueSlug(label, async (candidate) =>
    fs
      .access(coursePath(candidate))
      .then(() => true)
      .catch(() => false)
  );
  const course: Course = {
    id,
    label,
    createdAt: new Date().toISOString(),
    components: DEFAULT_COMPONENTS.map((c) => ({ ...c })),
    students: [],
    scores: {},
  };
  await writeCourse(course);
  return course;
}

export async function deleteCourse(id: string): Promise<boolean> {
  try {
    await fs.rm(coursePath(id));
    return true;
  } catch {
    return false;
  }
}

/** Replaces the roster. Scores of students who are still on it are kept; the rest are dropped. */
export async function setCourseRoster(id: string, students: CourseStudent[]): Promise<Course> {
  const course = await getCourse(id);
  if (!course) throw new Error("Unknown course.");
  course.students = students;
  const keep = new Set(students.map((s) => s.id));
  course.scores = Object.fromEntries(Object.entries(course.scores).filter(([sid]) => keep.has(sid)));
  await writeCourse(course);
  return course;
}

export async function updateComponent(
  id: string,
  key: ComponentKey,
  patch: Partial<Pick<CourseComponent, "label" | "weight" | "max" | "projectSlug">>
): Promise<Course> {
  const course = await getCourse(id);
  if (!course) throw new Error("Unknown course.");
  const component = course.components.find((c) => c.key === key);
  if (!component) throw new Error(`Unknown component: ${key}`);
  Object.assign(component, patch);
  await writeCourse(course);
  return course;
}

/** Removes every student's score for one component. Returns how many were cleared. */
export async function clearComponentScores(id: string, key: ComponentKey): Promise<number> {
  const course = await getCourse(id);
  if (!course) throw new Error("Unknown course.");

  let cleared = 0;
  for (const [studentId, scores] of Object.entries(course.scores)) {
    if (scores[key] === undefined) continue;
    delete scores[key];
    cleared++;
    if (Object.keys(scores).length === 0) delete course.scores[studentId];
  }

  await writeCourse(course);
  return cleared;
}

export interface ImportResult {
  imported: number;
  /** Solutions that are graded but couldn't be matched to a student on the roster. */
  unmatched: string[];
  /** Solutions in the grading project that haven't been graded yet. */
  ungraded: number;
  /** Students left without a score for this component. */
  missing: string[];
}

/**
 * Returned instead of importing when some of the grades to be pulled over
 * aren't locked (finalized) yet - the caller has to confirm before anything
 * is written, so half-finished grading never lands in the scorebook unnoticed.
 */
export interface ImportNeedsConfirmation {
  needsConfirmation: true;
  /** Graded solutions that are still unlocked. */
  unlocked: number;
  graded: number;
  ungraded: number;
}

export type ImportOutcome = ImportResult | ImportNeedsConfirmation;

/**
 * Pulls every graded solution of the component's linked grading project into
 * this course's scores, rescaled from the grading key's point total to the
 * component's own max. Students are matched on name with the same fuzzy
 * matcher the puntenlijst import uses, and anything it can't place is
 * reported back rather than guessed at.
 *
 * Stops short of importing - and writes nothing - when some of those grades
 * are still unlocked, unless the caller passes confirmUnlocked after warning.
 */
export async function importComponentScores(
  id: string,
  key: ComponentKey,
  confirmUnlocked = false
): Promise<ImportOutcome> {
  const course = await getCourse(id);
  if (!course) throw new Error("Unknown course.");
  const component = course.components.find((c) => c.key === key);
  if (!component?.projectSlug) throw new Error("Link a grading project to this component first.");
  if (course.students.length === 0) throw new Error("Import the student list for this course first.");

  const slug = component.projectSlug;
  const gradingKey = parseGradingKey(await getGradingKeyRaw(slug));
  const total = totalPoints(gradingKey);
  if (!gradingKey?.sections?.length || total <= 0) {
    throw new Error("That grading project has no grading key with points to import.");
  }

  const criterionIds = allCriterionIds(gradingKey);
  const solutions = await listSolutions(slug);

  const graded: {
    solutionId: string;
    label: string;
    originalFilename: string;
    points: number;
    locked: boolean;
  }[] = [];
  let ungraded = 0;
  for (const solution of solutions) {
    const state = await getGradingState(slug, solution.id, criterionIds);
    // Same "actually graded" test as everywhere else: updatedAt defaults to the epoch.
    if (Date.parse(state.updatedAt) <= 0) {
      ungraded++;
      continue;
    }
    graded.push({
      solutionId: solution.id,
      label: solution.label,
      originalFilename: solution.originalFilename,
      points: checkedPoints(gradingKey, state.criteria),
      locked: solution.locked ?? false,
    });
  }

  const unlocked = graded.filter((g) => !g.locked).length;
  if (unlocked > 0 && !confirmUnlocked) {
    return { needsConfirmation: true, unlocked, graded: graded.length, ungraded };
  }

  const matches = matchSolutionsToPuntenlijst(graded, course.students);
  const studentByName = new Map(course.students.map((s) => [s.name, s]));
  const bySolutionId = new Map(graded.map((g) => [g.solutionId, g]));

  const scored = new Set<string>();
  const unmatched: string[] = [];
  for (const match of matches) {
    const solution = bySolutionId.get(match.solutionId);
    if (!solution) continue;
    const student = match.suggestion ? studentByName.get(match.suggestion.name) : undefined;
    if (!student) {
      unmatched.push(solution.label);
      continue;
    }
    const scores = course.scores[student.id] ?? {};
    scores[key] = round2((solution.points / total) * component.max);
    course.scores[student.id] = scores;
    scored.add(student.id);
  }

  await writeCourse(course);

  return {
    imported: scored.size,
    unmatched,
    ungraded,
    missing: course.students.filter((s) => course.scores[s.id]?.[key] === undefined).map((s) => s.name),
  };
}
