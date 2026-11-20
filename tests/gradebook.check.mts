/**
 * Self-check for the scorebook's weighted-total and stats maths.
 * Run with: node tests/gradebook.check.ts
 */
import assert from "node:assert/strict";
import { computeCourseStats, on20, studentResults } from "../src/lib/courseStats.ts";
import type { Course } from "../src/lib/gradebook.ts";

const course: Course = {
  id: "test",
  label: "Test",
  createdAt: new Date(0).toISOString(),
  components: [
    { key: "toets", label: "Tussentijdse toets", weight: 30, max: 20, projectSlug: null },
    { key: "project", label: "Project", weight: 30, max: 20, projectSlug: null },
    { key: "exam", label: "Examen", weight: 40, max: 20, projectSlug: null },
  ],
  students: [
    { id: "a", name: "Ann", group: "D1", email: null, exemption: null },
    { id: "b", name: "Bo", group: "D1", email: null, exemption: null },
    { id: "c", name: "Cas", group: "D2", email: null, exemption: null },
  ],
  scores: {
    a: { toets: 16, project: 14, exam: 12 },
    b: { toets: 10 },
    c: { toets: 10, project: 10, exam: 10 },
  },
};

const results = studentResults(course);

// 30%*(16/20) + 30%*(14/20) + 40%*(12/20) = 24 + 21 + 24 = 69
assert.equal(results[0].totalPct, 69);
assert.equal(results[0].complete, true);
assert.equal(on20(69), 13.8);

// A partially scored student still has a running total, but never counts as complete.
assert.equal(results[1].complete, false);
assert.equal(results[1].started, true);
assert.equal(results[1].totalPct, 15);

assert.equal(results[2].totalPct, 50);

const stats = computeCourseStats(course);
assert.equal(stats.students, 3);
assert.equal(stats.complete, 2, "only fully scored students count towards the stats");
assert.equal(stats.averagePct, 59.5);
assert.equal(stats.medianPct, 59.5);
assert.equal(stats.minPct, 50);
assert.equal(stats.maxPct, 69);
assert.equal(stats.passRate, 1);
assert.equal(stats.stdDevPct, 9.5);

// 50% lands in the 50-60 band, 69% in 60-70.
assert.equal(stats.distribution[5].count, 1);
assert.equal(stats.distribution[6].count, 1);
assert.equal(stats.distribution.reduce((n, b) => n + b.count, 0), 2);

// Component averages include the incomplete student: 16, 10, 10 out of 20 = 60%.
const toets = stats.components.find((c) => c.key === "toets")!;
assert.equal(toets.scored, 3);
assert.equal(toets.avgPct, 60);
const exam = stats.components.find((c) => c.key === "exam")!;
assert.equal(exam.scored, 2);
assert.equal(exam.avgPct, 55);

// Groups are built from complete students only, best first.
assert.deepEqual(
  stats.groups.map((g) => [g.group, g.count, g.avgPct]),
  [
    ["D1", 1, 69],
    ["D2", 1, 50],
  ]
);

console.log("gradebook check: ok");
