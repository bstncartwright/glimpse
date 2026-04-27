import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import {
  buildSyntheticDocument,
  chunkTextLength,
  createSyntaxState,
  detectFiletype,
  makeChunk,
  sliceAndTruncateChunks,
  sliceWordWrappedChunks,
  splitChunksByLine,
} from "../src/syntax"
import { basicSyntaxLanguages } from "../src/syntax-languages"
import type { DiffFile } from "../src/types"

const file: DiffFile = {
  oldPath: "src/app.ts",
  newPath: "src/app.ts",
  displayPath: "src/app.ts",
  status: "modified",
  stats: { added: 2, deleted: 1 },
  hunks: [
    {
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 4,
      header: "",
      rows: [
        {
          kind: "context",
          oldLineNumber: 1,
          newLineNumber: 1,
          oldText: "const stable = true",
          newText: "const stable = true",
        },
        {
          kind: "modify",
          oldLineNumber: 2,
          newLineNumber: 2,
          oldText: "const value = 1",
          newText: "const value = 2",
        },
        {
          kind: "add",
          oldLineNumber: null,
          newLineNumber: 3,
          oldText: null,
          newText: "track(value)",
        },
        {
          kind: "delete",
          oldLineNumber: 3,
          newLineNumber: null,
          oldText: "remove(value)",
          newText: null,
        },
      ],
    },
  ],
}

describe("syntax helpers", () => {
  test("detects supported filetypes from diff paths", () => {
    expect(detectFiletype(file)).toBe("typescript")
    expect(detectFiletype({ ...file, oldPath: "README.unknown", newPath: "README.unknown" })).toBeUndefined()
  })

  test("normalizes common basic language extensions", () => {
    const paths = {
      "query.sql": "sql",
      "query.pgsql": "sql",
      "script.zsh": "bash",
      "program.cs": "csharp",
      "config.yaml": "yaml",
    }

    for (const [path, filetype] of Object.entries(paths)) {
      expect(detectFiletype({ ...file, oldPath: path, newPath: path, displayPath: path })).toBe(filetype)
    }
  })

  test("registers a basic syntax language pack", () => {
    expect(basicSyntaxLanguages.map((language) => language.filetype).sort()).toEqual([
      "bash",
      "c",
      "cpp",
      "csharp",
      "css",
      "go",
      "html",
      "java",
      "json",
      "php",
      "python",
      "ruby",
      "rust",
      "sql",
      "toml",
      "yaml",
    ])
  })

  test("highlights sql with the registered language pack", async () => {
    const state = createSyntaxState()
    const result = await state.client.highlightOnce("select id from users where active = true;\n", "sql")
    await state.client.destroy()

    expect(result.error).toBeUndefined()
    expect(result.warning).toBeUndefined()
    expect(result.highlights?.length).toBeGreaterThan(0)
  })

  test("builds old and new synthetic documents with row mappings", () => {
    const oldDocument = buildSyntheticDocument(file, "old")
    const newDocument = buildSyntheticDocument(file, "new")
    const rows = file.hunks[0]?.rows ?? []

    expect(oldDocument.content).toBe(["const stable = true", "const value = 1", "remove(value)"].join("\n"))
    expect(newDocument.content).toBe(["const stable = true", "const value = 2", "track(value)"].join("\n"))
    expect(oldDocument.rowLineNumbers.get(rows[2]!)).toBeUndefined()
    expect(newDocument.rowLineNumbers.get(rows[3]!)).toBeUndefined()
    expect(oldDocument.rowLineNumbers.get(rows[3]!)).toBe(2)
    expect(newDocument.rowLineNumbers.get(rows[2]!)).toBe(2)
  })

  test("splits styled chunks by line without dropping style", () => {
    const fg = RGBA.fromIndex(10)
    const lines = splitChunksByLine([makeChunk("one\ntwo", fg)])

    expect(lines).toHaveLength(2)
    expect(lines[0]?.[0]).toMatchObject({ text: "one", fg })
    expect(lines[1]?.[0]).toMatchObject({ text: "two", fg })
  })

  test("slices and truncates styled chunks for horizontal scroll", () => {
    const fg = RGBA.fromIndex(12)
    const chunks = [makeChunk("abcdef", fg), makeChunk("ghij", RGBA.fromIndex(13))]
    const visible = sliceAndTruncateChunks(chunks, 2, 5)

    expect(visible.map((chunk) => chunk.text).join("")).toBe("cdef…")
    expect(chunkTextLength(visible)).toBe(5)
    expect(visible[0]?.fg).toEqual(fg)
  })

  test("returns a plain slice when content fits", () => {
    const visible = sliceAndTruncateChunks([makeChunk("abc")], 1, 4)

    expect(visible.map((chunk) => chunk.text).join("")).toBe("bc")
    expect(chunkTextLength(visible)).toBe(2)
  })

  test("wraps styled chunks on word boundaries", () => {
    const fg = RGBA.fromIndex(12)
    const chunks = [makeChunk("alpha beta ", fg), makeChunk("gamma", RGBA.fromIndex(13))]

    expect(sliceWordWrappedChunks(chunks, 0, 8).map((chunk) => chunk.text).join("")).toBe("alpha")
    expect(sliceWordWrappedChunks(chunks, 1, 8).map((chunk) => chunk.text).join("")).toBe("beta")
    expect(sliceWordWrappedChunks(chunks, 2, 8).map((chunk) => chunk.text).join("")).toBe("gamma")
  })

  test("hard wraps long words when no word boundary fits", () => {
    const chunks = [makeChunk("abcdefghijkl")]

    expect(sliceWordWrappedChunks(chunks, 0, 5).map((chunk) => chunk.text).join("")).toBe("abcde")
    expect(sliceWordWrappedChunks(chunks, 1, 5).map((chunk) => chunk.text).join("")).toBe("fghij")
    expect(sliceWordWrappedChunks(chunks, 2, 5).map((chunk) => chunk.text).join("")).toBe("kl")
  })
})
