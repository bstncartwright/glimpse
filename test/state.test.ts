import { describe, expect, test } from "bun:test"
import {
  createInitialState,
  currentScrollX,
  currentScrollY,
  cycleLineDiffType,
  diffRowVisualRowCount,
  fileVisualRowCount,
  hunkVisualRowCount,
  markCurrentFileViewed,
  moveFile,
  moveHunk,
  moveHunkOrFile,
  setScrollX,
  setScrollY,
  toggleDiffLayout,
  toggleCurrentFileViewed,
  unmarkCurrentFileViewed,
  toggleWrap,
} from "../src/state"
import type { DiffFile, DiffSet } from "../src/types"

const file: DiffFile = {
  oldPath: "src/app.ts",
  newPath: "src/app.ts",
  displayPath: "src/app.ts",
  status: "modified",
  stats: { added: 2, deleted: 1 },
  hunks: [
    {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      header: "first",
      rows: [
        {
          kind: "context",
          oldLineNumber: 1,
          newLineNumber: 1,
          oldText: "const a = 1",
          newText: "const a = 1",
        },
        {
          kind: "modify",
          oldLineNumber: 2,
          newLineNumber: 2,
          oldText: "const b = 2",
          newText: "const b = 3",
        },
      ],
    },
    {
      oldStart: 20,
      oldLines: 1,
      newStart: 20,
      newLines: 2,
      header: "second",
      rows: [
        {
          kind: "add",
          oldLineNumber: null,
          newLineNumber: 20,
          oldText: null,
          newText: "added",
        },
      ],
    },
  ],
}

const diffSet: DiffSet = {
  source: { kind: "stdin", label: "stdin" },
  files: [file],
  raw: "",
}

describe("state hunk navigation", () => {
  test("defaults to side-by-side layout and toggles stacked layout", () => {
    const state = createInitialState(diffSet)

    expect(state.diffLayout).toBe("side-by-side")
    expect(state.wrap).toBe(true)
    expect(state.lineDiffType).toBe("word-alt")

    const stacked = toggleDiffLayout(state)
    expect(stacked.diffLayout).toBe("stacked")
    expect(stacked.message).toBe("diff layout: stacked ")

    const split = toggleDiffLayout(stacked)
    expect(split.diffLayout).toBe("side-by-side")
    expect(split.message).toBe("diff layout: side-by-side ")
  })

  test("cycles inline diff modes", () => {
    const state = createInitialState(diffSet)
    const word = cycleLineDiffType(state)
    const char = cycleLineDiffType(word)
    const none = cycleLineDiffType(char)
    const wordAlt = cycleLineDiffType(none)

    expect(word.lineDiffType).toBe("word")
    expect(word.message).toBe("inline diff: word ")
    expect(char.lineDiffType).toBe("char")
    expect(none.lineDiffType).toBe("none")
    expect(none.message).toBe("inline diff: off ")
    expect(wordAlt.lineDiffType).toBe("word-alt")
  })

  test("jumps to hunk headers within the active file", () => {
    const state = createInitialState(diffSet)
    const next = moveHunk(state, 1)

    expect(next.activeHunkIndex).toBe(1)
    expect(currentScrollY(next)).toBe(6)

    const previous = moveHunk(next, -1)
    expect(previous.activeHunkIndex).toBe(0)
    expect(currentScrollY(previous)).toBe(1)
  })

  test("moves through hunks before advancing to the next file", () => {
    const secondFile = { ...file, displayPath: "src/other.ts", newPath: "src/other.ts", oldPath: "src/other.ts" }
    const state = createInitialState({ ...diffSet, files: [file, secondFile] })

    const secondHunk = moveHunkOrFile(state, 1)
    expect(secondHunk.activeFileIndex).toBe(0)
    expect(secondHunk.activeHunkIndex).toBe(1)
    expect(currentScrollY(secondHunk)).toBe(6)

    const nextFile = moveHunkOrFile(secondHunk, 1)
    expect(nextFile.activeFileIndex).toBe(1)
    expect(nextFile.activeHunkIndex).toBe(0)
    expect(currentScrollY(nextFile)).toBe(1)
  })

  test("moves through hunks before returning to the previous file", () => {
    const secondFile = { ...file, displayPath: "src/other.ts", newPath: "src/other.ts", oldPath: "src/other.ts" }
    const state = createInitialState({ ...diffSet, files: [file, secondFile] })
    const nextFile = moveHunkOrFile(moveHunkOrFile(state, 1), 1)

    const previousFile = moveHunkOrFile(nextFile, -1)
    expect(previousFile.activeFileIndex).toBe(0)
    expect(previousFile.activeHunkIndex).toBe(1)
    expect(currentScrollY(previousFile)).toBe(6)

    const previousHunk = moveHunkOrFile(previousFile, -1)
    expect(previousHunk.activeFileIndex).toBe(0)
    expect(previousHunk.activeHunkIndex).toBe(0)
    expect(currentScrollY(previousHunk)).toBe(1)
  })

  test("keeps the active hunk in sync while scrolling", () => {
    const state = createInitialState(diffSet)

    expect(setScrollY(state, 0).activeHunkIndex).toBe(0)
    expect(setScrollY(state, 6).activeHunkIndex).toBe(1)
    expect(setScrollY(state, 99).activeHunkIndex).toBe(1)
  })

  test("tracks horizontal scroll per file", () => {
    const secondFile = { ...file, displayPath: "src/other.ts", newPath: "src/other.ts", oldPath: "src/other.ts" }
    const state = toggleWrap(createInitialState({ ...diffSet, files: [file, secondFile] }))
    const scrolled = setScrollX(state, 12)
    const nextFile = moveFile(scrolled, 1)

    expect(currentScrollX(scrolled)).toBe(12)
    expect(currentScrollX(nextFile)).toBe(0)
    expect(currentScrollX(moveFile(nextFile, -1))).toBe(12)
  })

  test("wrap mode clears and blocks horizontal scroll", () => {
    const state = setScrollX(toggleWrap(createInitialState(diffSet)), 12)
    const wrapped = toggleWrap(state)

    expect(wrapped.wrap).toBe(true)
    expect(currentScrollX(wrapped)).toBe(0)
    expect(currentScrollX(setScrollX(wrapped, 8))).toBe(0)

    const unwrapped = toggleWrap(wrapped)
    expect(unwrapped.wrap).toBe(false)
    expect(unwrapped.message).toBe("word wrap: off ")
  })

  test("counts visual rows by active diff layout", () => {
    const state = createInitialState(diffSet)
    const stacked = toggleDiffLayout(state)
    const firstHunk = file.hunks[0]!
    const contextRow = firstHunk.rows[0]!
    const modifyRow = firstHunk.rows[1]!

    expect(diffRowVisualRowCount(contextRow, "side-by-side")).toBe(1)
    expect(diffRowVisualRowCount(modifyRow, "side-by-side")).toBe(1)
    expect(diffRowVisualRowCount(contextRow, "stacked")).toBe(1)
    expect(diffRowVisualRowCount(modifyRow, "stacked")).toBe(2)
    expect(hunkVisualRowCount(firstHunk, "side-by-side")).toBe(5)
    expect(hunkVisualRowCount(firstHunk, "stacked")).toBe(6)
    expect(fileVisualRowCount(state)).toBe(9)
    expect(fileVisualRowCount(stacked)).toBe(10)
  })

  test("marks and unmarks the active file as viewed for the current session", () => {
    const state = createInitialState(diffSet)
    const marked = markCurrentFileViewed(state)

    expect(marked.viewedPaths["src/app.ts"]).toBe(true)

    const unmarked = unmarkCurrentFileViewed(marked)
    expect(unmarked.viewedPaths["src/app.ts"]).toBeUndefined()
  })

  test("toggles the active file viewed state", () => {
    const state = createInitialState(diffSet)
    const marked = toggleCurrentFileViewed(state)
    const unmarked = toggleCurrentFileViewed(marked)

    expect(marked.viewedPaths["src/app.ts"]).toBe(true)
    expect(unmarked.viewedPaths["src/app.ts"]).toBeUndefined()
  })
})
