import {
  RGBA,
  SyntaxStyle,
  getTreeSitterClient,
  parseColor,
  pathToFiletype,
  treeSitterToTextChunks,
  type ColorInput,
  type TextChunk,
  type TreeSitterClient,
} from "@opentui/core"
import type { DiffFile, DiffRow } from "./types"
import { theme } from "./theme"
import { registerBasicSyntaxLanguages } from "./syntax-languages"
import { wordWrapSegments } from "./wrap"

export type DiffSide = "old" | "new"

export type SyntaxState = {
  client: TreeSitterClient
  style: SyntaxStyle
  cache: Map<string, SyntaxCacheEntry>
  documents: WeakMap<DiffFile, Partial<Record<DiffSide, SyntheticDocument>>>
}

type SyntaxCacheEntry =
  | { status: "pending"; promise: Promise<void> }
  | { status: "ready"; lines: TextChunk[][] }
  | { status: "failed" }

export type SyntheticDocument = {
  content: string
  rowLineNumbers: Map<DiffRow, number>
}

export function createSyntaxState(): SyntaxState {
  const client = getTreeSitterClient()
  registerBasicSyntaxLanguages(client)

  return {
    client,
    style: createDiffSyntaxStyle(),
    cache: new Map(),
    documents: new WeakMap(),
  }
}

export function detectFiletype(file: DiffFile): string | undefined {
  const path = file.newPath ?? file.oldPath ?? file.displayPath
  return normalizeFiletype(pathToFiletype(path) ?? filetypeFromPath(path))
}

export function primeSyntaxForFile(state: SyntaxState, file: DiffFile, onReady?: () => void): void {
  const filetype = detectFiletype(file)
  if (!filetype || file.status === "binary") return

  primeSyntaxSide(state, file, "old", filetype, onReady)
  primeSyntaxSide(state, file, "new", filetype, onReady)
}

export function getSyntaxLine(state: SyntaxState, file: DiffFile, side: DiffSide, row: DiffRow): TextChunk[] | null {
  const filetype = detectFiletype(file)
  if (!filetype || file.status === "binary") return null

  const document = getSyntheticDocument(state, file, side)
  const lineNumber = document.rowLineNumbers.get(row)
  if (lineNumber === undefined) return null

  const entry = state.cache.get(cacheKey(file, side, filetype, document.content))
  if (!entry || entry.status !== "ready") return null
  return entry.lines[lineNumber] ?? null
}

export function buildSyntheticDocument(file: DiffFile, side: DiffSide): SyntheticDocument {
  const lines: string[] = []
  const rowLineNumbers = new Map<DiffRow, number>()

  for (const hunk of file.hunks) {
    for (const row of hunk.rows) {
      const text = side === "old" ? row.oldText : row.newText
      if (text === null) continue

      rowLineNumbers.set(row, lines.length)
      lines.push(text)
    }
  }

  return {
    content: lines.join("\n"),
    rowLineNumbers,
  }
}

export function splitChunksByLine(chunks: TextChunk[]): TextChunk[][] {
  const lines: TextChunk[][] = [[]]

  for (const chunk of chunks) {
    const parts = chunk.text.split("\n")
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index] ?? ""
      if (part.length > 0) {
        lines[lines.length - 1]?.push({ ...chunk, text: part })
      }

      if (index < parts.length - 1) {
        lines.push([])
      }
    }
  }

  return lines
}

export function sliceAndTruncateChunks(chunks: TextChunk[], scrollX: number, width: number): TextChunk[] {
  if (width <= 0) return []

  const total = chunkTextLength(chunks)
  const sliced = sliceChunks(chunks, scrollX, width)
  if (total - scrollX > width && width > 1) {
    const trimmed = sliceChunks(chunks, scrollX, width - 1)
    const last = trimmed.at(-1)
    return [...trimmed, makeChunk("…", last?.fg, last?.bg, last?.attributes)]
  }

  return sliced
}

export function sliceWordWrappedChunks(chunks: TextChunk[], segment: number, width: number): TextChunk[] {
  if (width <= 0) return []

  const text = chunks.map((chunk) => chunk.text).join("")
  const range = wordWrapSegments(text, width)[segment]
  if (!range) return []

  return sliceChunks(chunks, range.start, range.end - range.start)
}

export function chunkTextLength(chunks: TextChunk[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)
}

export function makeChunk(text: string, fg?: ColorInput | RGBA, bg?: ColorInput | RGBA, attributes?: number): TextChunk {
  return {
    __isChunk: true,
    text,
    ...(fg ? { fg: toRGBA(fg) } : {}),
    ...(bg ? { bg: toRGBA(bg) } : {}),
    ...(attributes !== undefined ? { attributes } : {}),
  }
}

export function applyFallbackFg(chunks: TextChunk[], fallback: ColorInput): TextChunk[] {
  const fallbackFg = toRGBA(fallback)
  return chunks.map((chunk) => (chunk.fg ? chunk : { ...chunk, fg: fallbackFg }))
}

function primeSyntaxSide(
  state: SyntaxState,
  file: DiffFile,
  side: DiffSide,
  filetype: string,
  onReady?: () => void,
): void {
  const document = getSyntheticDocument(state, file, side)
  const key = cacheKey(file, side, filetype, document.content)
  const existing = state.cache.get(key)
  if (existing) return

  const promise = state.client
    .highlightOnce(document.content, filetype)
    .then((result) => {
      if (result.error || result.warning || !result.highlights) {
        state.cache.set(key, { status: "failed" })
        return
      }

      const chunks = treeSitterToTextChunks(document.content, result.highlights, state.style, { enabled: false })
      state.cache.set(key, { status: "ready", lines: splitChunksByLine(chunks) })
      onReady?.()
    })
    .catch(() => {
      state.cache.set(key, { status: "failed" })
    })

  state.cache.set(key, { status: "pending", promise })
}

function getSyntheticDocument(state: SyntaxState, file: DiffFile, side: DiffSide): SyntheticDocument {
  const existing = state.documents.get(file)?.[side]
  if (existing) return existing

  const document = buildSyntheticDocument(file, side)
  const documents = state.documents.get(file) ?? {}
  documents[side] = document
  state.documents.set(file, documents)
  return document
}

function cacheKey(file: DiffFile, side: DiffSide, filetype: string, content: string): string {
  const path = file.newPath ?? file.oldPath ?? file.displayPath
  return `${path}\0${side}\0${filetype}\0${hashString(content)}`
}

export function sliceChunks(chunks: TextChunk[], start: number, width: number): TextChunk[] {
  if (width <= 0) return []

  const result: TextChunk[] = []
  let offset = 0
  let remaining = width

  for (const chunk of chunks) {
    const chunkStart = offset
    const chunkEnd = offset + chunk.text.length
    offset = chunkEnd

    if (chunkEnd <= start) continue
    if (chunkStart >= start + width) break

    const from = Math.max(0, start - chunkStart)
    const to = Math.min(chunk.text.length, from + remaining)
    if (to > from) {
      result.push({ ...chunk, text: chunk.text.slice(from, to) })
      remaining -= to - from
    }

    if (remaining <= 0) break
  }

  return result
}

function createDiffSyntaxStyle(): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    keyword: { fg: toRGBA(theme.syntax.keyword), bold: true },
    string: { fg: toRGBA(theme.syntax.string) },
    number: { fg: toRGBA(theme.syntax.number) },
    boolean: { fg: toRGBA(theme.syntax.number) },
    comment: { fg: toRGBA(theme.syntax.comment), italic: true },
    type: { fg: toRGBA(theme.syntax.type) },
    "type.builtin": { fg: toRGBA(theme.syntax.type) },
    function: { fg: toRGBA(theme.syntax.function) },
    "function.call": { fg: toRGBA(theme.syntax.function) },
    method: { fg: toRGBA(theme.syntax.function) },
    property: { fg: toRGBA(theme.syntax.property) },
    variable: { fg: toRGBA(theme.syntax.variable) },
    "variable.builtin": { fg: toRGBA(theme.syntax.keyword) },
    punctuation: { fg: toRGBA(theme.syntax.punctuation) },
    operator: { fg: toRGBA(theme.syntax.keyword) },
    constructor: { fg: toRGBA(theme.syntax.type) },
    constant: { fg: toRGBA(theme.syntax.number) },
    tag: { fg: toRGBA(theme.syntax.keyword) },
    attribute: { fg: toRGBA(theme.syntax.number) },
  })
}

function toRGBA(color: ColorInput | RGBA): RGBA {
  return color instanceof RGBA ? color : parseColor(color)
}

function normalizeFiletype(filetype: string | undefined): string | undefined {
  switch (filetype) {
    case "shell":
    case "sh":
    case "zsh":
      return "bash"
    case "c_sharp":
    case "c-sharp":
      return "csharp"
    case "pgsql":
    case "psql":
      return "sql"
    default:
      return filetype
  }
}

function filetypeFromPath(path: string): string | undefined {
  const basename = path.split("/").at(-1) ?? path
  const extension = basename.includes(".") ? basename.split(".").at(-1)?.toLowerCase() : undefined
  switch (extension) {
    case "pgsql":
    case "psql":
      return "sql"
    case "zsh":
      return "bash"
    default:
      return undefined
  }
}

function hashString(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}
