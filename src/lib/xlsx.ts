import AdmZip from "adm-zip";

/**
 * A minimal, read-only .xlsx parser (cell values only - no formulas, styles,
 * or number formats). Deliberately hand-rolled instead of depending on the
 * `xlsx` npm package, whose published releases carry unpatched high-severity
 * prototype-pollution/ReDoS advisories in the parts of it (formula and
 * number-format parsing) this app never uses anyway.
 */

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function colLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXmlEntities(t[1]));
    out.push(texts.join(""));
  }
  return out;
}

/** Parses one worksheet's rows into a dense 2D array of cell values (rows x columns, left-padded with null for empty cells). */
function parseSheetRows(xml: string, sharedStrings: string[]): (string | null)[][] {
  const rows: (string | null)[][] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    const cellByIdx = new Map<number, string | null>();
    let maxIdx = -1;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!refMatch) continue;
      const colIdx = colLetterToIndex(refMatch[1]);
      const type = attrs.match(/\bt="([a-zA-Z]+)"/)?.[1] ?? null;

      let value: string | null;
      if (type === "s") {
        const vMatch = inner.match(/<v>([^<]*)<\/v>/);
        value = vMatch ? (sharedStrings[Number(vMatch[1])] ?? "") : "";
      } else if (type === "inlineStr") {
        const tMatch = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
        value = tMatch ? decodeXmlEntities(tMatch[1]) : "";
      } else {
        const vMatch = inner.match(/<v>([^<]*)<\/v>/);
        value = vMatch ? vMatch[1] : null;
      }

      cellByIdx.set(colIdx, value);
      if (colIdx > maxIdx) maxIdx = colIdx;
    }

    const row: (string | null)[] = [];
    for (let i = 0; i <= maxIdx; i++) row.push(cellByIdx.has(i) ? (cellByIdx.get(i) ?? null) : null);
    rows.push(row);
  }
  return rows;
}

/** Reads the first worksheet of an .xlsx file into a dense array of rows (row 0 is typically the header row). */
export function parseXlsxFirstSheet(buffer: Buffer): (string | null)[][] {
  const zip = new AdmZip(buffer);

  const workbookXml = zip.getEntry("xl/workbook.xml")?.getData().toString("utf8");
  const relsXml = zip.getEntry("xl/_rels/workbook.xml.rels")?.getData().toString("utf8");

  let sheetTarget = "worksheets/sheet1.xml";
  if (workbookXml && relsXml) {
    const firstSheetRid = workbookXml.match(/<sheet\b[^>]*r:id="(rId\d+)"/)?.[1];
    if (firstSheetRid) {
      const relMatch = relsXml.match(new RegExp(`<Relationship\\b[^>]*Id="${firstSheetRid}"[^>]*Target="([^"]+)"`));
      if (relMatch) sheetTarget = relMatch[1].replace(/^\/?xl\//, "");
    }
  }

  const sheetEntry = zip.getEntry(`xl/${sheetTarget}`) ?? zip.getEntry("xl/worksheets/sheet1.xml");
  if (!sheetEntry) throw new Error("Not a valid .xlsx file (no worksheet found).");

  const sharedStrings = parseSharedStrings(zip.getEntry("xl/sharedStrings.xml")?.getData().toString("utf8") ?? null);
  return parseSheetRows(sheetEntry.getData().toString("utf8"), sharedStrings);
}
