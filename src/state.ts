import type { AppState, DiffHunk, DiffLayout, DiffRow, DiffSet, LineDiffType } from "./types"
import {
  defaultRowLayoutOptions,
  diffRowVisualRowCount as layoutDiffRowVisualRowCount,
  fileVisualRowCount as layoutFileVisualRowCount,
  hunkHeaderScrollY as layoutHunkHeaderScrollY,
  hunkIndexForScrollY as layoutHunkIndexForScrollY,
  hunkVisualRowCount as layoutHunkVisualRowCount,
  type RowLayoutOptions,
} from "./row-layout"

const LINE_DIFF_TYPES: LineDiffType[] = ["word-alt", "word", "char", "none"]

export function createInitialState(diffSet: DiffSet): AppState {
  return {
    diffSet,
    activeFileIndex: 0,
    activeHunkIndex: 0,
    scrollYByPath: {},
    scrollXByPath: {},
    viewedPaths: {},
    mode: "normal",
    diffLayout: "side-by-side",
    wrap: true,
    lineDiffType: "word-alt",
    message: null,
  }
}

export function activePath(state: AppState): string {
  const file = state.diffSet.files[state.activeFileIndex]
  return file?.displayPath ?? "__empty__"
}

export function currentScrollY(state: AppState): number {
  return state.scrollYByPath[activePath(state)] ?? 0
}

export function currentScrollX(state: AppState): number {
  return state.scrollXByPath[activePath(state)] ?? 0
}

export function setScrollY(state: AppState, value: number, options = defaultRowLayoutOptions(state.diffLayout)): AppState {
  const scrollY = Math.max(0, value)
  const file = state.diffSet.files[state.activeFileIndex]
  return {
    ...state,
    activeHunkIndex: file ? layoutHunkIndexForScrollY(file, scrollY, options) : 0,
    scrollYByPath: {
      ...state.scrollYByPath,
      [activePath(state)]: scrollY,
    },
  }
}

export function setScrollX(state: AppState, value: number): AppState {
  const scrollX = state.wrap ? 0 : Math.max(0, value)
  return {
    ...state,
    scrollXByPath: {
      ...state.scrollXByPath,
      [activePath(state)]: scrollX,
    },
  }
}

export function moveHunk(state: AppState, delta: number, options = defaultRowLayoutOptions(state.diffLayout)): AppState {
  const file = state.diffSet.files[state.activeFileIndex]
  if (!file || file.hunks.length === 0) return state

  const activeHunkIndex = clamp(state.activeHunkIndex + delta, 0, file.hunks.length - 1)
  return {
    ...state,
    activeHunkIndex,
    message: null,
    scrollYByPath: {
      ...state.scrollYByPath,
      [activePath(state)]: layoutHunkHeaderScrollY(file, activeHunkIndex, options),
    },
  }
}

export function moveHunkOrFile(state: AppState, delta: number, options = defaultRowLayoutOptions(state.diffLayout)): AppState {
  const file = state.diffSet.files[state.activeFileIndex]
  if (!file) return state

  if (delta > 0) {
    if (state.activeHunkIndex < file.hunks.length - 1) {
      return moveHunk(state, 1, options)
    }

    return moveFileToBoundaryHunk(state, state.activeFileIndex + 1, "first", options)
  }

  if (delta < 0) {
    if (state.activeHunkIndex > 0 && file.hunks.length > 0) {
      return moveHunk(state, -1, options)
    }

    return moveFileToBoundaryHunk(state, state.activeFileIndex - 1, "last", options)
  }

  return state
}

export function moveFile(state: AppState, delta: number): AppState {
  const count = state.diffSet.files.length
  if (count === 0) return state
  const activeFileIndex = clamp(state.activeFileIndex + delta, 0, count - 1)
  return {
    ...state,
    activeFileIndex,
    activeHunkIndex: 0,
    message: null,
  }
}

export function selectFile(state: AppState, index: number): AppState {
  const count = state.diffSet.files.length
  if (count === 0) return state
  return {
    ...state,
    activeFileIndex: clamp(index, 0, count - 1),
    activeHunkIndex: 0,
    message: null,
  }
}

export function toggleHelp(state: AppState): AppState {
  return {
    ...state,
    mode: state.mode === "help" ? "normal" : "help",
  }
}

export function toggleDiffLayout(state: AppState): AppState {
  const diffLayout = state.diffLayout === "side-by-side" ? "stacked" : "side-by-side"
  return {
    ...state,
    diffLayout,
    message: `diff layout: ${diffLayout} `,
  }
}

export function toggleWrap(state: AppState): AppState {
  const wrap = !state.wrap
  return {
    ...state,
    wrap,
    scrollXByPath: wrap
      ? {
          ...state.scrollXByPath,
          [activePath(state)]: 0,
        }
      : state.scrollXByPath,
    message: `word wrap: ${wrap ? "on" : "off"} `,
  }
}

export function cycleLineDiffType(state: AppState): AppState {
  const index = LINE_DIFF_TYPES.indexOf(state.lineDiffType)
  const lineDiffType = LINE_DIFF_TYPES[(index + 1) % LINE_DIFF_TYPES.length] ?? "word-alt"
  return {
    ...state,
    lineDiffType,
    message: `inline diff: ${lineDiffType === "none" ? "off" : lineDiffType} `,
  }
}

export function markCurrentFileViewed(state: AppState): AppState {
  const file = state.diffSet.files[state.activeFileIndex]
  if (!file) return state

  return {
    ...state,
    viewedPaths: {
      ...state.viewedPaths,
      [file.displayPath]: true,
    },
    message: `marked ${file.displayPath} viewed `,
  }
}

export function toggleCurrentFileViewed(state: AppState): AppState {
  const file = state.diffSet.files[state.activeFileIndex]
  if (!file) return state

  return state.viewedPaths[file.displayPath] ? unmarkCurrentFileViewed(state) : markCurrentFileViewed(state)
}

export function unmarkCurrentFileViewed(state: AppState): AppState {
  const file = state.diffSet.files[state.activeFileIndex]
  if (!file) return state

  const { [file.displayPath]: _removed, ...viewedPaths } = state.viewedPaths
  return {
    ...state,
    viewedPaths,
    message: `unmarked ${file.displayPath} viewed `,
  }
}

export function fileVisualRowCount(state: AppState): number {
  const file = state.diffSet.files[state.activeFileIndex]
  if (!file) return 0
  return layoutFileVisualRowCount(file, defaultRowLayoutOptions(state.diffLayout))
}

export function hunkVisualRowCount(hunk: DiffHunk, layout: DiffLayout): number {
  return layoutHunkVisualRowCount(hunk, defaultRowLayoutOptions(layout))
}

export function diffRowVisualRowCount(row: DiffRow, layout: DiffLayout): number {
  return layoutDiffRowVisualRowCount(row, defaultRowLayoutOptions(layout))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function moveFileToBoundaryHunk(
  state: AppState,
  requestedFileIndex: number,
  boundary: "first" | "last",
  options: RowLayoutOptions,
): AppState {
  const count = state.diffSet.files.length
  if (count === 0) return state

  const activeFileIndex = clamp(requestedFileIndex, 0, count - 1)
  if (activeFileIndex === state.activeFileIndex) return state

  const file = state.diffSet.files[activeFileIndex]
  if (!file) return state

  const activeHunkIndex = boundary === "last" ? Math.max(0, file.hunks.length - 1) : 0
  const nextState = {
    ...state,
    activeFileIndex,
    activeHunkIndex,
    message: null,
  }

  return {
    ...nextState,
    scrollYByPath: {
      ...state.scrollYByPath,
      [activePath(nextState)]: file.hunks.length > 0 ? layoutHunkHeaderScrollY(file, activeHunkIndex, options) : 0,
    },
  }
}
