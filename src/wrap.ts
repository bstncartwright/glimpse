export type WrapSegment = {
  start: number
  end: number
}

export function wordWrapSegments(text: string, width: number): WrapSegment[] {
  if (text.length === 0) return [{ start: 0, end: 0 }]

  const wrapWidth = Math.max(1, width)
  const segments: WrapSegment[] = []
  let start = 0

  while (start < text.length) {
    const hardEnd = Math.min(text.length, start + wrapWidth)
    if (hardEnd >= text.length) {
      segments.push({ start, end: text.length })
      break
    }

    const breakAt = wordBreakBefore(text, start, hardEnd)
    if (breakAt > start) {
      segments.push({ start, end: breakAt })
      start = skipBreakWhitespace(text, breakAt)
      continue
    }

    segments.push({ start, end: hardEnd })
    start = hardEnd
  }

  return segments
}

function wordBreakBefore(text: string, start: number, hardEnd: number): number {
  for (let index = hardEnd; index > start; index -= 1) {
    if (isWrapWhitespace(text[index - 1] ?? "")) return index - 1
  }

  return -1
}

function skipBreakWhitespace(text: string, start: number): number {
  let index = start
  while (index < text.length && isWrapWhitespace(text[index] ?? "")) {
    index += 1
  }
  return index
}

function isWrapWhitespace(value: string): boolean {
  return value === " " || value === "\t"
}
