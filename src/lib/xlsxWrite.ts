import AdmZip from "adm-zip";

/**
 * Minimal .xlsx writer: inline strings, numbers, column widths, a bold header
 * style and clustered bar charts. Just enough for the gradebook export - the
 * libraries that write spreadsheets can't write charts anyway, so there's
 * nothing to borrow here.
 */

export type Cell = string | number | null;

export interface ChartSpec {
  title: string;
  /** A1-style reference to the category labels, e.g. `Statistiek!$A$12:$A$21`. */
  cats: string;
  /** A1-style reference to the values. */
  vals: string;
  /** Top-left cell of the chart, zero-based, plus its size in cells. */
  anchor: { col: number; row: number; cols: number; rows: number };
}

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  /** Column widths in characters. */
  widths?: number[];
  /** Zero-based row indexes to render bold. */
  boldRows?: number[];
  charts?: ChartSpec[];
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_CHART = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_DRAW = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_SS_DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function colLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetXml(sheet: SheetSpec): string {
  const bold = new Set(sheet.boldRows ?? []);
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const rows = sheet.rows
    .map((cells, r) => {
      const body = cells
        .map((value, c) => {
          if (value === null || value === "") return "";
          const ref = `${colLetter(c)}${r + 1}`;
          const style = bold.has(r) ? ' s="1"' : "";
          return typeof value === "number"
            ? `<c r="${ref}"${style}><v>${value}</v></c>`
            : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${body}</row>`;
    })
    .join("");

  const drawing = sheet.charts?.length ? '<drawing r:id="rId1"/>' : "";
  return `${XML}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${cols}<sheetData>${rows}</sheetData>${drawing}</worksheet>`;
}

function chartXml(chart: ChartSpec, id: number): string {
  const catAx = 111000 + id;
  const valAx = 222000 + id;
  // Single series, so no legend - the title already says what is plotted.
  return `${XML}<c:chartSpace xmlns:c="${NS_CHART}" xmlns:a="${NS_DRAW}" xmlns:r="${NS_REL}"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(
    chart.title
  )}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${esc(
    chart.title
  )}</c:v></c:tx><c:cat><c:strRef><c:f>${esc(
    chart.cats
  )}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${esc(
    chart.vals
  )}</c:f></c:numRef></c:val></c:ser><c:gapWidth val="50"/><c:axId val="${catAx}"/><c:axId val="${valAx}"/></c:barChart><c:catAx><c:axId val="${catAx}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="${valAx}"/></c:catAx><c:valAx><c:axId val="${valAx}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="${catAx}"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function drawingXml(charts: ChartSpec[], firstChartId: number): string {
  const anchors = charts
    .map((chart, i) => {
      const { col, row, cols, rows } = chart.anchor;
      return `<xdr:twoCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${
        col + cols
      }</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${
        row + rows
      }</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${
        firstChartId + i
      }" name="Chart ${firstChartId + i}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_CHART}"><c:chart xmlns:c="${NS_CHART}" xmlns:r="${NS_REL}" r:id="rId${
        i + 1
      }"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    })
    .join("");
  return `${XML}<xdr:wsDr xmlns:xdr="${NS_SS_DRAW}" xmlns:a="${NS_DRAW}">${anchors}</xdr:wsDr>`;
}

const STYLES = `${XML}<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function buildXlsx(sheets: SheetSpec[]): Buffer {
  const zip = new AdmZip();
  const add = (path: string, body: string) => zip.addFile(path, Buffer.from(body, "utf8"));

  const overrides: string[] = [`<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`];
  let chartId = 1;

  sheets.forEach((sheet, i) => {
    const n = i + 1;
    add(`xl/worksheets/sheet${n}.xml`, sheetXml(sheet));
    overrides.push(
      `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    );

    if (!sheet.charts?.length) return;

    add(
      `xl/worksheets/_rels/sheet${n}.xml.rels`,
      `${XML}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`
    );
    add(`xl/drawings/drawing${n}.xml`, drawingXml(sheet.charts, chartId + 1));
    overrides.push(
      `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    );

    const rels = sheet.charts
      .map((_, c) => `<Relationship Id="rId${c + 1}" Type="${NS_REL}/chart" Target="../charts/chart${chartId + c}.xml"/>`)
      .join("");
    add(`xl/drawings/_rels/drawing${n}.xml.rels`, `${XML}<Relationships xmlns="${NS_PKG_REL}">${rels}</Relationships>`);

    sheet.charts.forEach((chart) => {
      add(`xl/charts/chart${chartId}.xml`, chartXml(chart, chartId));
      overrides.push(
        `<Override PartName="/xl/charts/chart${chartId}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
      );
      chartId++;
    });
  });

  add("xl/styles.xml", STYLES);
  add(
    "xl/workbook.xml",
    `${XML}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${sheets
      .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `${XML}<Relationships xmlns="${NS_PKG_REL}">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`
  );
  add(
    "_rels/.rels",
    `${XML}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );
  add(
    "[Content_Types].xml",
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides.join(
      ""
    )}</Types>`
  );

  return zip.toBuffer();
}
