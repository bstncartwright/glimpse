export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "binary"

export type DiffSource =
  | { kind: "unstaged"; label: "unstaged" }
  | { kind: "staged"; label: "staged" }
  | { kind: "range"; label: string; range: string }
  | { kind: "stdin"; label: "stdin" }
  | { kind: "file"; label: string; path: string }

export type DiffSet = {
  source: DiffSource
  files: DiffFile[]
  raw: string
}

export type DiffFile = {
  oldPath: string | null
  newPath: string | null
  displayPath: string
  status: FileStatus
  hunks: DiffHunk[]
  stats: FileStats
  binaryMessage?: string
}

export type FileStats = {
  added: number
  deleted: number
}

export type DiffHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  rows: DiffRow[]
}

export type DiffRow = {
  kind: "context" | "add" | "delete" | "modify"
  oldLineNumber: number | null
  newLineNumber: number | null
  oldText: string | null
  newText: string | null
}

export type ViewRow =
  | { type: "hunk"; header: string }
  | { type: "spacer" }
  | { type: "row"; row: DiffRow }

export type AppMode = "normal" | "help"
export type DiffLayout = "side-by-side" | "stacked"
export type LineDiffType = "word-alt" | "word" | "char" | "none"

export type AppState = {
  diffSet: DiffSet
  activeFileIndex: number
  activeHunkIndex: number
  scrollYByPath: Record<string, number>
  scrollXByPath: Record<string, number>
  viewedPaths: Record<string, boolean>
  mode: AppMode
  diffLayout: DiffLayout
  wrap: boolean
  lineDiffType: LineDiffType
  message: string | null
}
