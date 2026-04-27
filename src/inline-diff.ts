import { diffChars, diffWordsWithSpace, type ChangeObject } from "diff"
import { RGBA, parseColor, type ColorInput, type TextChunk } from "@opentui/core"
import type { LineDiffType } from "./types"

export type InlineDiffRange = {
  start: number
  end: number
}

export type InlineDiffRanges = {
  oldRanges: InlineDiffRange[]
  newRanges: InlineDiffRange[]
}

export const DEFAULT_MAX_LINE_DIFF_LENGTH = 1000
const MIN_INLINE_SIMILARITY = 0.45

type Span = [0 | 1, string]

export function computeInlineDiffRanges(
  oldText: string | null,
  newText: string | null,
  lineDiffType: LineDiffType,
  maxLineDiffLength = DEFAULT_MAX_LINE_DIFF_LENGTH,
): InlineDiffRanges {
  if (oldText === null || newText === null || lineDiffType === "none") {
    return { oldRanges: [], newRanges: [] }
  }

  if (oldText.length > maxLineDiffLength || newText.length > maxLineDiffLength) {
    return { oldRanges: [], newRanges: [] }
  }

  const lineDiff = lineDiffType === "char" ? diffChars(oldText, newText) : diffWordsWithSpace(oldText, newText)
  if (lineSimilarity(lineDiff, oldText, newText) < MIN_INLINE_SIMILARITY) {
    return { oldRanges: [], newRanges: [] }
  }

  const oldSpans: Span[] = []
  const newSpans: Span[] = []
  const enableJoin = lineDiffType === "word-alt"
  const lastItem = lineDiff.at(-1)

  for (const item of lineDiff) {
    const isLastItem = item === lastItem
    if (!item.added && !item.removed) {
      pushOrJoinSpan({ item, spans: oldSpans, enableJoin, isNeutral: true, isLastItem })
      pushOrJoinSpan({ item, spans: newSpans, enableJoin, isNeutral: true, isLastItem })
    } else if (item.removed) {
      pushOrJoinSpan({ item, spans: oldSpans, enableJoin, isLastItem })
    } else {
      pushOrJoinSpan({ item, spans: newSpans, enableJoin, isLastItem })
    }
  }

  return {
    oldRanges: rangesFromSpans(oldSpans),
    newRanges: rangesFromSpans(newSpans),
  }
}

function lineSimilarity(lineDiff: ChangeObject<string>[], oldText: string, newText: string): number {
  const oldLength = oldText.trim().length
  const newLength = newText.trim().length
  if (oldLength === 0 || newLength === 0) {
    return oldLength === newLength ? 1 : 0
  }

  const commonLength = lineDiff.reduce((sum, part) => {
    return part.added || part.removed ? sum : sum + part.value.trim().length
  }, 0)
  return commonLength / Math.max(oldLength, newLength)
}

export function applyInlineBg(chunks: TextChunk[], ranges: InlineDiffRange[], bg: ColorInput | RGBA): TextChunk[] {
  const mergedRanges = mergeRanges(ranges)
  if (mergedRanges.length === 0) return chunks

  const inlineBg = bg instanceof RGBA ? bg : parseColor(bg)
  const result: TextChunk[] = []
  let chunkStart = 0
  let rangeIndex = 0

  for (const chunk of chunks) {
    const chunkEnd = chunkStart + chunk.text.length
    let cursor = chunkStart

    while (cursor < chunkEnd) {
      while (rangeIndex < mergedRanges.length && mergedRanges[rangeIndex]!.end <= cursor) {
        rangeIndex += 1
      }

      const range = mergedRanges[rangeIndex]
      const segmentEnd =
        range && range.start < chunkEnd ? Math.min(chunkEnd, Math.max(cursor + 1, range.start > cursor ? range.start : range.end)) : chunkEnd
      const text = chunk.text.slice(cursor - chunkStart, segmentEnd - chunkStart)
      if (text.length > 0) {
        const highlighted = Boolean(range && cursor >= range.start && cursor < range.end)
        result.push(highlighted ? { ...chunk, text, bg: inlineBg } : { ...chunk, text })
      }
      cursor = segmentEnd
    }

    if (chunk.text.length === 0) {
      result.push(chunk)
    }

    chunkStart = chunkEnd
  }

  return result
}

function pushOrJoinSpan({
  item,
  spans,
  enableJoin,
  isNeutral = false,
  isLastItem = false,
}: {
  item: ChangeObject<string>
  spans: Span[]
  enableJoin: boolean
  isNeutral?: boolean
  isLastItem?: boolean
}): void {
  const lastSpan = spans.at(-1)
  if (!lastSpan || !enableJoin || (isNeutral && isLastItem)) {
    spans.push([isNeutral ? 0 : 1, item.value])
    return
  }

  const isLastSpanNeutral = lastSpan[0] === 0
  if (isNeutral === isLastSpanNeutral || (isNeutral && item.value.length === 1 && !isLastSpanNeutral)) {
    lastSpan[1] += item.value
    return
  }

  spans.push([isNeutral ? 0 : 1, item.value])
}

function rangesFromSpans(spans: Span[]): InlineDiffRange[] {
  const ranges: InlineDiffRange[] = []
  let offset = 0
  for (const [highlighted, text] of spans) {
    if (highlighted === 1 && text.length > 0) {
      ranges.push({ start: offset, end: offset + text.length })
    }
    offset += text.length
  }
  return ranges
}

function mergeRanges(ranges: InlineDiffRange[]): InlineDiffRange[] {
  const sorted = ranges.filter((range) => range.end > range.start).sort((a, b) => a.start - b.start)
  const merged: InlineDiffRange[] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}
