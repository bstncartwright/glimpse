import { diffWordsWithSpace } from "diff"
import type { DiffFile, DiffHunk, DiffRow, DiffSet, DiffSource, FileStatus } from "./types"

type MutableFile = DiffFile & {
  _oldPathRaw?: string
  _newPathRaw?: string
}

type PendingLine = {
  lineNumber: number
  text: string
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/
const MODIFY_SIMILARITY_THRESHOLD = 0.45

export function parseUnifiedDiff(raw: string, source: DiffSource): DiffSet {
  const files: MutableFile[] = []
  let currentFile: MutableFile | null = null
  let currentHunk: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0
  let pendingDeletes: PendingLine[] = []
  let pendingAdds: PendingLine[] = []

  const flushPending = () => {
    if (!currentHunk) return
    currentHunk.rows.push(...alignPendingRows(pendingDeletes, pendingAdds))
    pendingDeletes = []
    pendingAdds = []
  }

  const finishFile = () => {
    flushPending()
    if (!currentFile) return
    currentFile.status = resolveStatus(currentFile)
    currentFile.displayPath = displayPathFor(currentFile)
    delete currentFile._oldPathRaw
    delete currentFile._newPathRaw
  }

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      finishFile()
      currentHunk = null
      currentFile = createFileFromGitHeader(line)
      files.push(currentFile)
      continue
    }

    if (!currentFile) {
      continue
    }

    if (line.startsWith("new file mode ")) {
      currentFile.status = "added"
      continue
    }

    if (line.startsWith("deleted file mode ")) {
      currentFile.status = "deleted"
      continue
    }

    if (line.startsWith("rename from ")) {
      currentFile.status = "renamed"
      currentFile.oldPath = unquotePath(line.slice("rename from ".length))
      continue
    }

    if (line.startsWith("rename to ")) {
      currentFile.status = "renamed"
      currentFile.newPath = unquotePath(line.slice("rename to ".length))
      continue
    }

    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      currentFile.status = "binary"
      currentFile.binaryMessage = line
      continue
    }

    if (line.startsWith("--- ")) {
      const path = line.slice(4)
      currentFile._oldPathRaw = path
      currentFile.oldPath = path === "/dev/null" ? null : stripDiffPrefix(unquotePath(path))
      continue
    }

    if (line.startsWith("+++ ")) {
      const path = line.slice(4)
      currentFile._newPathRaw = path
      currentFile.newPath = path === "/dev/null" ? null : stripDiffPrefix(unquotePath(path))
      continue
    }

    const hunkMatch = line.match(HUNK_RE)
    if (hunkMatch) {
      flushPending()
      oldLine = Number(hunkMatch[1])
      newLine = Number(hunkMatch[3])
      currentHunk = {
        oldStart: oldLine,
        oldLines: Number(hunkMatch[2] ?? "1"),
        newStart: newLine,
        newLines: Number(hunkMatch[4] ?? "1"),
        header: hunkMatch[5] ?? "",
        rows: [],
      }
      currentFile.hunks.push(currentHunk)
      continue
    }

    if (!currentHunk) {
      continue
    }

    if (line === "\\ No newline at end of file") {
      continue
    }

    const prefix = line[0]
    const text = line.slice(1)

    if (prefix === " ") {
      flushPending()
      currentHunk.rows.push({
        kind: "context",
        oldLineNumber: oldLine,
        newLineNumber: newLine,
        oldText: text,
        newText: text,
      })
      oldLine += 1
      newLine += 1
      continue
    }

    if (prefix === "-") {
      if (pendingAdds.length > 0) {
        flushPending()
      }
      pendingDeletes.push({ lineNumber: oldLine, text })
      currentFile.stats.deleted += 1
      oldLine += 1
      continue
    }

    if (prefix === "+") {
      pendingAdds.push({ lineNumber: newLine, text })
      currentFile.stats.added += 1
      newLine += 1
    }
  }

  finishFile()

  return {
    source,
    files,
    raw,
  }
}

function createFileFromGitHeader(line: string): MutableFile {
  const match = line.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/)
  const oldPath = match ? unquotePath(match[1] ?? "") : null
  const newPath = match ? unquotePath(match[2] ?? "") : null

  return {
    oldPath,
    newPath,
    displayPath: newPath ?? oldPath ?? "(unknown)",
    status: "modified",
    hunks: [],
    stats: { added: 0, deleted: 0 },
  }
}

function resolveStatus(file: DiffFile): FileStatus {
  if (file.status === "binary" || file.status === "renamed" || file.status === "added" || file.status === "deleted") {
    return file.status
  }

  if (file.oldPath === null && file.newPath) return "added"
  if (file.newPath === null && file.oldPath) return "deleted"
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) return "renamed"
  return "modified"
}

function displayPathFor(file: DiffFile): string {
  if (file.status === "renamed" && file.oldPath && file.newPath) {
    return `${file.oldPath} -> ${file.newPath}`
  }

  return file.newPath ?? file.oldPath ?? "(unknown)"
}

function stripDiffPrefix(path: string): string {
  if (path.startsWith("a/") || path.startsWith("b/")) {
    return path.slice(2)
  }
  return path
}

function unquotePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed.startsWith("\"") || !trimmed.endsWith("\"")) {
    return trimmed
  }

  try {
    return JSON.parse(trimmed) as string
  } catch {
    return trimmed.slice(1, -1)
  }
}

export function flattenFileRows(file: DiffFile): DiffRow[] {
  return file.hunks.flatMap((hunk) => hunk.rows)
}

function alignPendingRows(deletions: PendingLine[], additions: PendingLine[]): DiffRow[] {
  if (deletions.length === 0) {
    return additions.map(addRow)
  }

  if (additions.length === 0) {
    return deletions.map(deleteRow)
  }

  const rows = deletions.length
  const cols = additions.length
  const scores = Array.from({ length: rows }, (_, oldIndex) =>
    Array.from({ length: cols }, (_, newIndex) => lineSimilarity(deletions[oldIndex]!.text, additions[newIndex]!.text)),
  )
  const dp = Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => 0))

  for (let oldIndex = rows - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = cols - 1; newIndex >= 0; newIndex -= 1) {
      const score = scores[oldIndex]![newIndex]!
      const match = score >= MODIFY_SIMILARITY_THRESHOLD ? score + dp[oldIndex + 1]![newIndex + 1]! : Number.NEGATIVE_INFINITY
      const skipOld = dp[oldIndex + 1]![newIndex]!
      const skipNew = dp[oldIndex]![newIndex + 1]!
      dp[oldIndex]![newIndex] = Math.max(match, skipOld, skipNew)
    }
  }

  const result: DiffRow[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < rows || newIndex < cols) {
    const deletion = deletions[oldIndex]
    const addition = additions[newIndex]

    if (deletion && addition) {
      const score = scores[oldIndex]![newIndex]!
      const matchScore = score >= MODIFY_SIMILARITY_THRESHOLD ? score + dp[oldIndex + 1]![newIndex + 1]! : Number.NEGATIVE_INFINITY
      if (matchScore >= dp[oldIndex + 1]![newIndex]! && matchScore >= dp[oldIndex]![newIndex + 1]!) {
        result.push(modifyRow(deletion, addition))
        oldIndex += 1
        newIndex += 1
        continue
      }

      if (dp[oldIndex]![newIndex + 1]! >= dp[oldIndex + 1]![newIndex]!) {
        result.push(addRow(addition))
        newIndex += 1
        continue
      }

      result.push(deleteRow(deletion))
      oldIndex += 1
      continue
    }

    if (addition) {
      result.push(addRow(addition))
      newIndex += 1
    } else if (deletion) {
      result.push(deleteRow(deletion))
      oldIndex += 1
    }
  }

  return result
}

function modifyRow(deletion: PendingLine, addition: PendingLine): DiffRow {
  return {
    kind: "modify",
    oldLineNumber: deletion.lineNumber,
    newLineNumber: addition.lineNumber,
    oldText: deletion.text,
    newText: addition.text,
  }
}

function deleteRow(deletion: PendingLine): DiffRow {
  return {
    kind: "delete",
    oldLineNumber: deletion.lineNumber,
    newLineNumber: null,
    oldText: deletion.text,
    newText: null,
  }
}

function addRow(addition: PendingLine): DiffRow {
  return {
    kind: "add",
    oldLineNumber: null,
    newLineNumber: addition.lineNumber,
    oldText: null,
    newText: addition.text,
  }
}

function lineSimilarity(oldText: string, newText: string): number {
  if (oldText === newText) return 1

  const oldComparable = oldText.trim()
  const newComparable = newText.trim()
  if (oldComparable.length === 0 || newComparable.length === 0) {
    return oldComparable === newComparable ? 1 : 0
  }

  const commonLength = diffWordsWithSpace(oldComparable, newComparable).reduce((sum, part) => {
    return part.added || part.removed ? sum : sum + part.value.length
  }, 0)

  return commonLength / Math.max(oldComparable.length, newComparable.length)
}
