import { NextResponse } from "next/server";
import { computeCourseStats, on20, studentResults } from "@/lib/courseStats";
import { getCourse } from "@/lib/gradebook";
import { buildXlsx, type Cell, type SheetSpec } from "@/lib/xlsxWrite";

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function GET(_request: Request, ctx: RouteContext<"/api/courses/[courseId]/export">) {
  const { courseId } = await ctx.params;
  const course = await getCourse(courseId);
  if (!course) return NextResponse.json({ error: "Unknown course." }, { status: 404 });

  const stats = computeCourseStats(course);
  const results = studentResults(course).sort(
    (a, b) =>
      (a.student.group ?? "￿").localeCompare(b.student.group ?? "￿") ||
      a.student.name.localeCompare(b.student.name)
  );

  const scores: SheetSpec = {
    name: "Punten",
    boldRows: [0],
    widths: [28, 12, 12, ...course.components.map(() => 18), 12, 10, 14],
    rows: [
      [
        "Student",
        "Groep",
        "Vrijstelling",
        ...course.components.map((c) => `${c.label} /${c.max}`),
        "Totaal /20",
        "Totaal %",
        "Resultaat",
      ],
      ...results.map((r) => [
        r.student.name,
        r.student.group,
        r.student.exemption,
        ...course.components.map((c) => r.scores[c.key] ?? null),
        r.complete ? on20(r.totalPct) : null,
        r.complete ? round1(r.totalPct) : null,
        r.complete ? (r.totalPct >= 50 ? "Geslaagd" : "Niet geslaagd") : "Onvolledig",
      ]),
    ],
  };

  // The stats sheet is built row by row so the chart references can point at
  // the rows the tables actually ended up on.
  const rows: Cell[][] = [];
  const bold: number[] = [];
  const push = (...cells: Cell[]) => rows.push(cells) - 1;
  const heading = (...cells: Cell[]) => {
    bold.push(push(...cells));
  };

  heading(course.label);
  push("Studenten", stats.students);
  push("Volledig gescoord", stats.complete);
  push("Gemiddelde /20", round1(on20(stats.averagePct)));
  push("Mediaan /20", round1(on20(stats.medianPct)));
  push("Standaardafwijking (%)", round1(stats.stdDevPct));
  push("Geslaagd (%)", round1(stats.passRate * 100));
  push("Laagste /20", round1(on20(stats.minPct)));
  push("Hoogste /20", round1(on20(stats.maxPct)));
  push();

  heading("Verdeling totaalscore (%)", "Aantal studenten");
  const distFirst = rows.length + 1;
  for (const band of stats.distribution) push(band.label, band.count);
  const distLast = rows.length;
  push();

  heading("Per onderdeel", "Gemiddelde %", "Gescoord", "Gewicht %", "Max");
  for (const c of stats.components) push(c.label, round1(c.avgPct), c.scored, c.weight, c.max);
  push();

  heading("Per groep", "Gemiddelde /20", "Studenten");
  const groupFirst = rows.length + 1;
  for (const g of stats.groups) push(g.group ?? "(geen groep)", round1(on20(g.avgPct)), g.count);
  const groupLast = rows.length;

  const statistics: SheetSpec = {
    name: "Statistiek",
    boldRows: bold,
    widths: [26, 18, 12, 12, 10],
    rows,
    charts: [
      {
        title: "Verdeling van de totaalscores",
        cats: `Statistiek!$A$${distFirst}:$A$${distLast}`,
        vals: `Statistiek!$B$${distFirst}:$B$${distLast}`,
        anchor: { col: 6, row: 1, cols: 9, rows: 18 },
      },
      ...(stats.groups.length > 0
        ? [
            {
              title: "Gemiddelde per groep (/20)",
              cats: `Statistiek!$A$${groupFirst}:$A$${groupLast}`,
              vals: `Statistiek!$B$${groupFirst}:$B$${groupLast}`,
              anchor: { col: 6, row: 20, cols: 9, rows: 18 },
            },
          ]
        : []),
    ],
  };

  const file = buildXlsx([scores, statistics]);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${courseId}.xlsx"`,
    },
  });
}
