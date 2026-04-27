import { describe, expect, test } from "bun:test"
import {
  fileRows,
  fileVisualRowCount,
  hunkHeaderScrollY,
  hunkIndexForScrollY,
  type RowLayoutOptions,
} from "../src/row-layout"
import type { DiffFile } from "../src/types"

const longLine = "abcdefghijklmnopqrstuvwxyz"

const file: DiffFile = {
  oldPath: "src/wrap.ts",
  newPath: "src/wrap.ts",
  displayPath: "src/wrap.ts",
  status: "modified",
  stats: { added: 1, deleted: 1 },
  hunks: [
    {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      header: "first",
      rows: [
        {
          kind: "modify",
          oldLineNumber: 1,
          newLineNumber: 1,
          oldText: longLine,
          newText: "abc",
        },
      ],
    },
    {
      oldStart: 10,
      oldLines: 1,
      newStart: 10,
      newLines: 1,
      header: "second",
      rows: [
        {
          kind: "add",
          oldLineNumber: null,
          newLineNumber: 10,
          oldText: null,
          newText: longLine,
        },
      ],
    },
  ],
}

const sideBySideWrap: RowLayoutOptions = {
  layout: "side-by-side",
  wrap: true,
  oldTextWidth: 10,
  newTextWidth: 10,
}

describe("diff row layout", () => {
  test("expands side-by-side rows into fixed visual segments", () => {
    const rows = fileRows(file, sideBySideWrap)

    expect(rows.slice(2, 5)).toEqual([
      { type: "side-by-side", row: file.hunks[0]!.rows[0]!, segment: 0 },
      { type: "side-by-side", row: file.hunks[0]!.rows[0]!, segment: 1 },
      { type: "side-by-side", row: file.hunks[0]!.rows[0]!, segment: 2 },
    ])
    expect(fileVisualRowCount(file, sideBySideWrap)).toBe(12)
  })

  test("keeps hunk navigation aligned with wrapped row counts", () => {
    expect(hunkHeaderScrollY(file, 1, sideBySideWrap)).toBe(7)
    expect(hunkIndexForScrollY(file, 6, sideBySideWrap)).toBe(0)
    expect(hunkIndexForScrollY(file, 7, sideBySideWrap)).toBe(1)
  })

  test("wraps stacked cells independently", () => {
    const stackedWrap: RowLayoutOptions = {
      layout: "stacked",
      wrap: true,
      oldTextWidth: 8,
      newTextWidth: 8,
    }

    const rows = fileRows(file, stackedWrap)

    expect(rows.slice(2, 7).map((row) => (row.type === "cell" ? [row.type, row.side, row.segment] : [row.type]))).toEqual([
      ["cell", "old", 0],
      ["cell", "old", 1],
      ["cell", "old", 2],
      ["cell", "old", 3],
      ["cell", "new", 0],
    ])
  })

  test("counts word-wrapped visual rows by word boundaries", () => {
    const wordyFile: DiffFile = {
      ...file,
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          header: "",
          rows: [
            {
              kind: "add",
              oldLineNumber: null,
              newLineNumber: 1,
              oldText: null,
              newText: "alpha beta gamma",
            },
          ],
        },
      ],
    }

    expect(
      fileRows(wordyFile, { ...sideBySideWrap, oldTextWidth: 8, newTextWidth: 8 }).filter((row) => row.type === "side-by-side"),
    ).toHaveLength(3)
  })
})
