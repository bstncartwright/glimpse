import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { applyInlineBg, computeInlineDiffRanges } from "../src/inline-diff"
import { makeChunk } from "../src/syntax"

describe("inline diff ranges", () => {
  test("highlights simple word replacements", () => {
    expect(computeInlineDiffRanges("const value = 1", "const value = 2", "word-alt")).toEqual({
      oldRanges: [{ start: 14, end: 15 }],
      newRanges: [{ start: 14, end: 15 }],
    })
  })

  test("joins punctuation gaps in word-alt mode", () => {
    expect(computeInlineDiffRanges("old foo/bar done", "old baz/qux done", "word-alt")).toEqual({
      oldRanges: [{ start: 4, end: 11 }],
      newRanges: [{ start: 4, end: 11 }],
    })
  })

  test("keeps punctuation gaps separate in word mode", () => {
    expect(computeInlineDiffRanges("old foo/bar done", "old baz/qux done", "word")).toEqual({
      oldRanges: [
        { start: 4, end: 7 },
        { start: 8, end: 11 },
      ],
      newRanges: [
        { start: 4, end: 7 },
        { start: 8, end: 11 },
      ],
    })
  })

  test("captures whitespace-only changes", () => {
    expect(computeInlineDiffRanges("const value = 1", "const  value = 1", "word-alt")).toEqual({
      oldRanges: [{ start: 5, end: 6 }],
      newRanges: [{ start: 5, end: 7 }],
    })
  })

  test("captures insertions and deletions", () => {
    expect(computeInlineDiffRanges("hello world", "hello brave world", "word-alt")).toEqual({
      oldRanges: [],
      newRanges: [{ start: 6, end: 12 }],
    })
    expect(computeInlineDiffRanges("hello brave world", "hello world", "word-alt")).toEqual({
      oldRanges: [{ start: 6, end: 12 }],
      newRanges: [],
    })
  })

  test("skips low-similarity full-line replacements", () => {
    expect(computeInlineDiffRanges("alpha beta", "gamma delta", "word-alt")).toEqual({
      oldRanges: [],
      newRanges: [],
    })
  })

  test("skips long lines", () => {
    const oldText = "a".repeat(1001)
    const newText = "b".repeat(1001)
    expect(computeInlineDiffRanges(oldText, newText, "word-alt")).toEqual({ oldRanges: [], newRanges: [] })
  })

  test("supports char mode", () => {
    expect(computeInlineDiffRanges("foo(bar)", "foo(baz)", "char")).toEqual({
      oldRanges: [{ start: 6, end: 7 }],
      newRanges: [{ start: 6, end: 7 }],
    })
  })

  test("supports disabled mode", () => {
    expect(computeInlineDiffRanges("old", "new", "none")).toEqual({ oldRanges: [], newRanges: [] })
  })
})

describe("inline diff chunk overlay", () => {
  test("preserves text and syntax foregrounds while adding backgrounds", () => {
    const fgA = RGBA.fromIndex(10)
    const fgB = RGBA.fromIndex(11)
    const bg = RGBA.fromIndex(12)
    const chunks = [makeChunk("const ", fgA), makeChunk("value", fgB)]
    const styled = applyInlineBg(chunks, [{ start: 3, end: 9 }], bg)

    expect(styled.map((chunk) => chunk.text).join("")).toBe("const value")
    expect(styled.map((chunk) => chunk.text)).toEqual(["con", "st ", "val", "ue"])
    expect(styled[0]?.bg).toBeUndefined()
    expect(styled[1]?.bg).toEqual(bg)
    expect(styled[1]?.fg).toEqual(fgA)
    expect(styled[2]?.bg).toEqual(bg)
    expect(styled[2]?.fg).toEqual(fgB)
    expect(styled[3]?.bg).toBeUndefined()
  })

  test("leaves chunks unchanged when there are no ranges", () => {
    const chunks = [makeChunk("abc", RGBA.fromIndex(10))]
    expect(applyInlineBg(chunks, [], RGBA.fromIndex(12))).toBe(chunks)
  })
})
