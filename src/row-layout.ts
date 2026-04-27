import type { DiffFile, DiffHunk, DiffLayout, DiffRow } from "./types"
import { wordWrapSegments } from "./wrap"

export type RowLayoutOptions = {
  layout: DiffLayout
  wrap: boolean
  oldTextWidth: number
  newTextWidth: number
}

export type DiffRenderRow =
  | { type: "hunk"; header: string }
  | { type: "spacer" }
  | { type: "side-by-side"; row: DiffRow; segment: number }
  | { type: "cell"; row: DiffRow; side: "old" | "new"; segment: number }

export function defaultRowLayoutOptions(layout: DiffLayout): RowLayoutOptions {
  return {
    layout,
    wrap: false,
    oldTextWidth: Number.MAX_SAFE_INTEGER,
    newTextWidth: Number.MAX_SAFE_INTEGER,
  }
}

export function fileRows(file: DiffFile, options: RowLayoutOptions): DiffRenderRow[] {
  return file.hunks.flatMap((hunk) => [
    { type: "hunk" as const, header: formatHunkHeader(hunk.oldStart, hunk.newStart, hunk.header) },
    { type: "spacer" as const },
    ...hunk.rows.flatMap((row) => diffRowsForLayout(row, options)),
    { type: "spacer" as const },
  ])
}

export function fileVisualRowCount(file: DiffFile, options: RowLayoutOptions): number {
  return file.hunks.reduce((sum, hunk) => sum + hunkVisualRowCount(hunk, options), 0)
}

export function hunkVisualRowCount(hunk: DiffHunk, options: RowLayoutOptions): number {
  return 3 + hunk.rows.reduce((sum, row) => sum + diffRowVisualRowCount(row, options), 0)
}

export function diffRowVisualRowCount(row: DiffRow, options: RowLayoutOptions): number {
  return diffRowsForLayout(row, options).length
}

export function hunkHeaderScrollY(file: DiffFile, hunkIndex: number, options: RowLayoutOptions): number {
  let row = 0
  for (let index = 0; index < hunkIndex; index += 1) {
    const hunk = file.hunks[index]
    if (!hunk) break
    row += hunkVisualRowCount(hunk, options)
  }

  return row + 1
}

export function hunkIndexForScrollY(file: DiffFile, scrollY: number, options: RowLayoutOptions): number {
  if (file.hunks.length === 0) return 0

  let activeHunkIndex = 0
  let row = 0
  for (let index = 0; index < file.hunks.length; index += 1) {
    const hunk = file.hunks[index]
    if (!hunk) break
    const hunkStart = row + 1
    if (scrollY < hunkStart) break
    activeHunkIndex = index
    row += hunkVisualRowCount(hunk, options)
  }

  return activeHunkIndex
}

function diffRowsForLayout(row: DiffRow, options: RowLayoutOptions): DiffRenderRow[] {
  if (options.layout === "side-by-side") {
    const count = Math.max(
      segmentCount(row.oldText, options.oldTextWidth, options.wrap),
      segmentCount(row.newText, options.newTextWidth, options.wrap),
    )
    return Array.from({ length: count }, (_, segment) => ({ type: "side-by-side" as const, row, segment }))
  }

  if (row.kind === "modify") {
    return [
      ...cellRows(row, "old", options.oldTextWidth, options.wrap),
      ...cellRows(row, "new", options.newTextWidth, options.wrap),
    ]
  }

  if (row.kind === "delete") {
    return cellRows(row, "old", options.oldTextWidth, options.wrap)
  }

  if (row.kind === "add") {
    return cellRows(row, "new", options.newTextWidth, options.wrap)
  }

  return cellRows(row, "new", options.newTextWidth, options.wrap)
}

function cellRows(row: DiffRow, side: "old" | "new", width: number, wrap: boolean): DiffRenderRow[] {
  const text = side === "old" ? row.oldText : row.newText
  return Array.from({ length: segmentCount(text, width, wrap) }, (_, segment) => ({
    type: "cell" as const,
    side,
    row,
    segment,
  }))
}

function segmentCount(text: string | null, width: number, wrap: boolean): number {
  if (!wrap) return 1
  if (text === null || text.length === 0) return 1
  return wordWrapSegments(text, width).length
}

function formatHunkHeader(oldStart: number, newStart: number, header: string): string {
  return `-${oldStart} +${newStart}${header ? ` ${header}` : ""}`
}
