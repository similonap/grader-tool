import { diffLines } from "diff";

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

/**
 * Line-level diff between two file contents, annotated with old/new line
 * numbers so the UI can render a GitHub-style two-gutter view.
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const changes = diffLines(normalizeLineEndings(oldText), normalizeLineEndings(newText));
  const lines: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;

  for (const change of changes) {
    const changeLines = change.value.split("\n");
    if (changeLines[changeLines.length - 1] === "") changeLines.pop();

    for (const content of changeLines) {
      if (change.added) {
        lines.push({ type: "add", content, oldLineNo: null, newLineNo: newNo });
        newNo += 1;
      } else if (change.removed) {
        lines.push({ type: "remove", content, oldLineNo: oldNo, newLineNo: null });
        oldNo += 1;
      } else {
        lines.push({ type: "context", content, oldLineNo: oldNo, newLineNo: newNo });
        oldNo += 1;
        newNo += 1;
      }
    }
  }

  return lines;
}
