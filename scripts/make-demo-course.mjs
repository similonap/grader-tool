import fs from "node:fs";

/**
 * Writes a demo course full of dummy students and scores, so a fully
 * filled-in scorebook can be clicked through without touching real data.
 *
 *   node scripts/make-demo-course.mjs [seed]
 *
 * The seed makes a run reproducible; omit it for a fresh cohort. Delete the
 * demo again with the course page's own "Delete course" button.
 */

// Deterministic pseudo-random, so re-running produces the same demo course.
let seed = Number(process.argv[2]) || Math.floor(Math.random() * 2 ** 31);
const usedSeed = seed;
const rnd = () => {
  // mulberry32 - stays exact in doubles, unlike a 31-bit LCG whose multiply
  // loses precision past 2^53 and collapses the sequence.
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = (mean, sd) => {
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const first = ["Lars","Noor","Imane","Yassine","Fien","Jarne","Marie","Senne","Amber","Youssef","Lotte","Robbe","Nina","Milan","Zara","Thibo","Elise","Kobe","Aya","Wout","Jana","Sami","Febe","Dries","Lina","Arne","Mila","Ibrahim","Silke","Ruben","Hanne","Mats","Nora","Jonas","Emma","Victor","Lena","Daan","Sara","Finn","Anouk","Rayan","Tess","Bram","Yara","Stan","Lore","Kasper","Amina","Vic","Juno","Mohammed","Ella","Tuur","Nadia","Gilles"];
const last = ["Peeters","Janssens","Maes","Jacobs","Mertens","Willems","Claes","Goossens","Wouters","De Smet","Dubois","Vermeulen","Declercq","Van Damme","Lemmens","Coppens","Segers","Van Hoof","Michiels","Smets","Hermans","De Clerck","Cools","Lauwers","Verhoeven","Pauwels","Van Den Broeck","Geerts","De Cock","Michels","Nguyen","El Amrani","Ozturk","Bogaerts","Thys","Simoens","Haddad","Verlinden","Stevens","Martens","Dierckx","Aerts","Beckers","Vandenberghe","Rousseau","Diallo","Kaya","Luyten","Timmermans","Berben","Wauters","Schmitz","Ceulemans","Vos","Baeten","Rombouts"];
const groups = ["1PRO_D1A", "1PRO_D2A", "1PRO_D3A"];

const clamp = (n, max) => Math.min(max, Math.max(0, n));
const r2 = (n) => Math.round(n * 100) / 100;
const half = (n) => Math.round(n * 2) / 2;

const students = [];
const scores = {};
for (let i = 0; i < 56; i++) {
  const name = `${last[i]} ${first[i]}`;
  const id = String(180001 + i);
  students.push({
    id,
    name,
    group: groups[i % groups.length],
    email: `${first[i].toLowerCase()}.${last[i].toLowerCase().replace(/[^a-z]+/g, "")}@student.ap.be`,
    // One exemption, to show the badge.
    exemption: i === 7 ? "EVK" : null,
  });

  // An underlying ability per student, so the three components correlate the
  // way real results do, plus per-component noise and a different difficulty.
  const ability = gauss(0.60, 0.13);
  scores[id] = {
    toets: r2(clamp(20 * (ability + gauss(0, 0.09) - 0.04), 20)),
    project: half(clamp(20 * (ability + gauss(0, 0.06) + 0.05), 20)),
    exam: r2(clamp(20 * (ability + gauss(0, 0.1)), 20)),
  };
}

const course = {
  id: "demo-voorbeeldvak-2026-2027",
  label: "DEMO — Voorbeeldvak 2026-2027",
  createdAt: new Date().toISOString(),
  components: [
    { key: "toets", label: "Tussentijdse toets", weight: 30, max: 20, projectSlug: null },
    { key: "project", label: "Project", weight: 30, max: 20, projectSlug: null },
    { key: "exam", label: "Examen", weight: 40, max: 20, projectSlug: null },
  ],
  students,
  scores,
  updatedAt: new Date().toISOString(),
};

fs.mkdirSync("data/courses", { recursive: true });
fs.writeFileSync(`data/courses/${course.id}.json`, JSON.stringify(course, null, 2));

const totals = students.map((s) => {
  const sc = scores[s.id];
  return (sc.toets / 20) * 30 + (sc.project / 20) * 30 + (sc.exam / 20) * 40;
});
const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
console.log(`wrote data/courses/${course.id}.json (seed ${usedSeed})`);
console.log(`${students.length} students, average ${(avg / 5).toFixed(1)}/20, ` +
  `range ${(Math.min(...totals) / 5).toFixed(1)}-${(Math.max(...totals) / 5).toFixed(1)}, ` +
  `pass ${Math.round((totals.filter((t) => t >= 50).length / totals.length) * 100)}%`);
