import { Box, StyledText, Text, TextAttributes, type CliRenderer, type ColorInput, type TextChunk } from "@opentui/core"
import type { AppState, DiffFile, DiffLayout, DiffRow, FileStatus, LineDiffType } from "./types"
import { currentScrollX, currentScrollY } from "./state"
import { fileRows, type DiffRenderRow, type RowLayoutOptions } from "./row-layout"
import { CELL_PREFIX_WIDTH, CELL_RIGHT_PADDING, cellTextWidth } from "./cell-metrics"
import { theme as colors } from "./theme"
import { applyInlineBg, computeInlineDiffRanges } from "./inline-diff"
import {
  applyFallbackFg,
  chunkTextLength,
  getSyntaxLine,
  makeChunk,
  sliceAndTruncateChunks,
  sliceWordWrappedChunks,
  type SyntaxState,
} from "./syntax"

type RenderMetrics = {
  rows: number
  cols: number
  bodyRows: number
  paneWidth: number
}

export function renderApp(renderer: CliRenderer, state: AppState, syntaxState?: SyntaxState): void {
  const existing = renderer.root.getRenderable("app")
  if (existing) {
    renderer.root.remove("app")
  }

  const metrics = getMetrics()
  const root = Box(
    {
      id: "app",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: colors.bg,
    },
    renderTopBar(state, metrics),
    renderMain(state, metrics, syntaxState),
    renderStatusBar(state, metrics),
    ...(state.mode === "help" ? [renderHelpOverlay(metrics)] : []),
  )

  renderer.root.add(root)
}

function renderTopBar(state: AppState, metrics: RenderMetrics) {
  const viewedCount = state.diffSet.files.filter((file) => state.viewedPaths[file.displayPath]).length
  const fileCount = state.diffSet.files.length
  const viewedLabel = `${viewedCount}/${fileCount} viewed`

  return Box(
    {
      height: 5,
      width: "100%",
      flexDirection: "column",
      backgroundColor: colors.panel,
      border: ["bottom"],
      borderColor: colors.border,
      paddingX: 1,
    },
    Text({
      content: truncate(`glimpse  ${state.diffSet.source.label}  ${viewedLabel}`, metrics.cols),
      fg: colors.command,
      attributes: TextAttributes.BOLD,
      height: 1,
    }),
    Text({
      content: "─".repeat(metrics.cols),
      fg: colors.border,
      bg: colors.panel,
      height: 1,
      truncate: true,
    }),
    renderTabs(state, metrics),
    renderActiveFilePath(state, metrics),
  )
}

function renderTabs(state: AppState, metrics: RenderMetrics) {
  const files = state.diffSet.files
  if (files.length === 0) {
    return Text({
      content: " no changes ",
      fg: colors.muted,
      height: 1,
    })
  }

  const maxWidth = Math.max(12, metrics.cols - 2)
  const active = state.activeFileIndex
  const counterWidth = ` ${active + 1}/${files.length} files › `.length
  const fixedWidth = 1 + counterWidth + 2 + 1
  const tabAreaWidth = Math.max(0, maxWidth - fixedWidth)
  const tabs = files.map((file, index) => ({
    index,
    selected: index === active,
    status: file.status,
    path: file.displayPath,
    viewed: Boolean(state.viewedPaths[file.displayPath]),
  }))

  let start = active
  let end = active + 1
  let width = Math.min(preferredTabWidth(tabs[active]), tabAreaWidth)

  while (width < tabAreaWidth) {
    const canAddLeft = start > 0
    const canAddRight = end < tabs.length
    if (!canAddLeft && !canAddRight) break

    const leftWidth = canAddLeft ? preferredTabWidth(tabs[start - 1]) : Number.MAX_SAFE_INTEGER
    const rightWidth = canAddRight ? preferredTabWidth(tabs[end]) : Number.MAX_SAFE_INTEGER

    if (canAddLeft && leftWidth <= rightWidth && width + leftWidth <= tabAreaWidth) {
      start -= 1
      width += leftWidth
    } else if (canAddRight && width + rightWidth <= tabAreaWidth) {
      end += 1
      width += rightWidth
    } else if (canAddLeft && width + leftWidth <= tabAreaWidth) {
      start -= 1
      width += leftWidth
    } else {
      break
    }
  }

  let remainingTabWidth = tabAreaWidth
  const chunks: TextChunk[] = [makeChunk("│", colors.muted, colors.panel)]

  for (const tab of tabs.slice(start, end)) {
    const tabText = renderTabText(tab, Math.max(0, remainingTabWidth - 1))
    if (tabText.length > 0) {
      chunks.push(
        makeChunk(
          tabText,
          tab.selected ? colors.activeTabText : colorForStatus(tab.status),
          tab.selected ? colors.activeTabBg : colors.panel,
          tab.selected ? TextAttributes.BOLD : 0,
        ),
      )
      remainingTabWidth -= tabText.length
    }

    if (remainingTabWidth > 0) {
      chunks.push(makeChunk("│", colors.border, colors.panel))
      remainingTabWidth -= 1
    }
  }

  const leftMore = start > 0 ? "‹" : " "
  const counter = ` ${active + 1}/${files.length} files ${end < tabs.length ? "›" : " "} `
  const usedWidth = chunkTextLength(chunks) + leftMore.length + 1 + counter.length + 1
  const filler = Math.max(0, maxWidth - usedWidth)
  chunks.push(makeChunk(`${" ".repeat(filler)}${leftMore} `, colors.muted, colors.panel))
  chunks.push(makeChunk(counter, colors.muted, colors.panel))
  chunks.push(makeChunk("│", colors.border, colors.panel))

  return Text({
    content: new StyledText(chunks),
    bg: colors.panel,
    height: 1,
    truncate: true,
  })
}

function renderActiveFilePath(state: AppState, metrics: RenderMetrics) {
  const file = state.diffSet.files[state.activeFileIndex]
  const path = file?.displayPath ?? "no changes"
  const hunk = file?.hunks[state.activeHunkIndex]
  const hunkLabel = hunk ? `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` : ""
  const stats = file ? ` ${statusBadge(file.status)} +${file.stats.added} -${file.stats.deleted}` : ""
  const viewed = file && state.viewedPaths[file.displayPath] ? " ✓" : ""
  const left = ` ${path}${viewed}${stats}`
  const right = hunkLabel ? ` ${hunkLabel} ` : ""
  const gap = Math.max(1, metrics.cols - left.length - right.length)

  return Text({
    content: truncate(`${left}${" ".repeat(gap)}${right}`, metrics.cols),
    fg: colors.active,
    bg: colors.panel,
    height: 1,
  })
}

function renderMain(state: AppState, metrics: RenderMetrics, syntaxState?: SyntaxState) {
  return Box(
    {
      flexGrow: 1,
      width: "100%",
      flexDirection: "column",
      backgroundColor: colors.bg,
    },
    renderDiffArea(state, metrics, syntaxState),
  )
}

function renderDiffArea(state: AppState, metrics: RenderMetrics, syntaxState?: SyntaxState) {
  const file = state.diffSet.files[state.activeFileIndex]
  if (!file) {
    return Box(
      {
        flexGrow: 1,
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bg,
      },
      Text({
        content: "working tree is clean",
        fg: colors.muted,
      }),
    )
  }

  if (file.status === "binary") {
    return Box(
      {
        flexGrow: 1,
        height: "100%",
        flexDirection: "column",
        padding: 2,
        backgroundColor: colors.bg,
      },
      Text({ content: file.displayPath, fg: colors.text, attributes: TextAttributes.BOLD, height: 1 }),
      Text({ content: file.binaryMessage ?? "binary file changed", fg: colors.warn, height: 1 }),
    )
  }

  const scrollbarWidth = metrics.cols > 40 ? 1 : 0
  const diffMetrics = metricsWithCols(metrics, metrics.cols - scrollbarWidth)
  const layoutOptions = rowLayoutOptionsForMetrics(state, diffMetrics)
  const rows = fileRows(file, layoutOptions)
  const viewportRows = Math.max(1, diffMetrics.bodyRows)
  const maxScrollY = Math.max(0, rows.length - viewportRows)
  const scrollY = clamp(currentScrollY(state), 0, maxScrollY)
  const scrollX = currentScrollX(state)
  const visibleRows = rows.slice(scrollY, scrollY + viewportRows)

  return Box(
    {
      flexGrow: 1,
      height: "100%",
      width: "100%",
      flexDirection: "row",
      backgroundColor: colors.bg,
    },
    Box(
      {
        height: "100%",
        width: diffMetrics.cols,
        flexDirection: "column",
        backgroundColor: colors.bg,
      },
      renderDiffBorder("top", diffMetrics, state.diffLayout),
      Box(
        {
          height: viewportRows,
          width: "100%",
          flexDirection: "column",
          backgroundColor: colors.bg,
        },
      ...renderDiffRows(
        file,
        visibleRows,
        diffMetrics,
        viewportRows,
        scrollX,
        state.diffLayout,
        state.wrap,
        state.lineDiffType,
        syntaxState,
      ),
      ),
      renderDiffBorder("bottom", diffMetrics, state.diffLayout),
    ),
    ...(scrollbarWidth === 1 ? [renderScrollBar(scrollY, rows.length, viewportRows, scrollY > 0)] : []),
  )
}

function renderScrollBar(scrollY: number, totalRows: number, viewportRows: number, visible: boolean) {
  const height = viewportRows + 2
  const maxScroll = Math.max(0, totalRows - viewportRows)
  const thumbHeight =
    maxScroll === 0 ? height : clamp(Math.floor((viewportRows / Math.max(1, totalRows)) * height), 1, height)
  const thumbTop = maxScroll === 0 ? 0 : Math.round((scrollY / maxScroll) * Math.max(0, height - thumbHeight))

  return Box(
    {
      height,
      width: 1,
      flexDirection: "column",
      backgroundColor: colors.bg,
    },
    ...Array.from({ length: height }, (_, index) => {
      const isThumb = index >= thumbTop && index < thumbTop + thumbHeight
      return Text({
        content: visible ? (isThumb ? "█" : "│") : " ",
        fg: isThumb ? colors.active : colors.border,
        bg: colors.bg,
        height: 1,
      })
    }),
  )
}

function renderDiffRows(
  file: DiffFile,
  rows: DiffRenderRow[],
  metrics: RenderMetrics,
  viewportRows: number,
  scrollX: number,
  layout: DiffLayout,
  wrap: boolean,
  lineDiffType: LineDiffType,
  syntaxState?: SyntaxState,
) {
  const renderedRows = rows.map((row) => {
    if (row.type === "hunk") {
      return renderHunkSeparator(row, metrics, layout)
    }

    if (row.type === "spacer") {
      return renderEmptyDiffRow(metrics, layout)
    }

    if (row.type === "cell") {
      return renderStackedRow(file, row, metrics, scrollX, wrap, lineDiffType, syntaxState)
    }

    return renderSideBySideRow(file, row, metrics, scrollX, wrap, lineDiffType, syntaxState)
  })

  const emptyRows = Math.max(0, viewportRows - renderedRows.length)
  return [...renderedRows, ...Array.from({ length: emptyRows }, () => renderEmptyDiffRow(metrics, layout))]
}

function renderHunkSeparator(viewRow: Extract<DiffRenderRow, { type: "hunk" }>, metrics: RenderMetrics, layout: DiffLayout) {
  if (layout === "stacked") {
    const maxLabelWidth = Math.max(8, metrics.cols - 4)
    const label = ` ${truncate(`@@ ${viewRow.header}`, maxLabelWidth - 2)} `
    const rightRuleWidth = Math.max(0, metrics.cols - label.length - 2)

    return Text({
      content: `├${label}${"─".repeat(rightRuleWidth)}┤`,
      fg: colors.warn,
      bg: colors.panel,
      height: 1,
      truncate: true,
    })
  }

  const leftWidth = metrics.paneWidth - 2
  const maxLabelWidth = Math.max(8, metrics.cols - leftWidth - 4)
  const label = ` ${truncate(`@@ ${viewRow.header}`, maxLabelWidth - 2)} `
  const leftRuleWidth = Math.max(1, leftWidth)
  const rightRuleWidth = Math.max(0, metrics.cols - leftRuleWidth - label.length - 3)

  return Text({
    content: `├${"─".repeat(leftRuleWidth)}┼${label}${"─".repeat(rightRuleWidth)}┤`,
    fg: colors.warn,
    bg: colors.panel,
    height: 1,
    truncate: true,
  })
}

function renderSideBySideRow(
  file: DiffFile,
  viewRow: Extract<DiffRenderRow, { type: "side-by-side" }>,
  metrics: RenderMetrics,
  scrollX: number,
  wrap: boolean,
  lineDiffType: LineDiffType,
  syntaxState?: SyntaxState,
) {
  return Box(
    {
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: colors.bg,
    },
    renderDiffCell(file, "old", viewRow.row, viewRow.segment, metrics.paneWidth, true, scrollX, wrap, lineDiffType, syntaxState),
    renderDiffCell(
      file,
      "new",
      viewRow.row,
      viewRow.segment,
      metrics.cols - metrics.paneWidth,
      false,
      scrollX,
      wrap,
      lineDiffType,
      syntaxState,
    ),
  )
}

function renderStackedRow(
  file: DiffFile,
  viewRow: Extract<DiffRenderRow, { type: "cell" }>,
  metrics: RenderMetrics,
  scrollX: number,
  wrap: boolean,
  lineDiffType: LineDiffType,
  syntaxState?: SyntaxState,
) {
  return Box(
    {
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: colors.bg,
    },
    renderDiffCell(file, viewRow.side, viewRow.row, viewRow.segment, metrics.cols, true, scrollX, wrap, lineDiffType, syntaxState),
  )
}

function renderDiffCell(
  file: DiffFile,
  side: "old" | "new",
  row: DiffRow,
  segment: number,
  paneWidth: number,
  includeLeftBorder: boolean,
  scrollX: number,
  wrap: boolean,
  lineDiffType: LineDiffType,
  syntaxState?: SyntaxState,
) {
  const leftBorder = includeLeftBorder ? "│" : ""
  const rightBorder = "│"
  const borderWidth = leftBorder.length + rightBorder.length
  const contentWidth = Math.max(8, paneWidth - borderWidth)
  const lineNumber = side === "old" ? row.oldLineNumber : row.newLineNumber
  const text = side === "old" ? row.oldText : row.newText
  const marker = markerFor(side, row)
  const fg = fgFor(side, row)
  const bg = bgFor(side, row)
  const line = segment > 0 || lineNumber === null ? "    " : String(lineNumber).padStart(4)
  const prefixMarker = segment > 0 ? " " : marker
  const available = Math.max(1, contentWidth - CELL_PREFIX_WIDTH - CELL_RIGHT_PADDING)
  const syntaxLine = syntaxState ? getSyntaxLine(syntaxState, file, side, row) : null
  const rawChunks = syntaxLine ?? [makeChunk(text ?? "", fg)]
  const inlineRanges =
    row.kind === "modify" ? computeInlineDiffRanges(row.oldText, row.newText, lineDiffType) : { oldRanges: [], newRanges: [] }
  const sideRanges = side === "old" ? inlineRanges.oldRanges : inlineRanges.newRanges
  const baseChunks = applyCellBg(applyFallbackFg(rawChunks, fg), bg)
  const textChunks = applyInlineBg(baseChunks, sideRanges, side === "old" ? colors.delInlineBg : colors.addInlineBg)
  const visibleChunks = wrap
    ? sliceWordWrappedChunks(textChunks, segment, available)
    : sliceAndTruncateChunks(textChunks, scrollX, available)
  const visibleWidth = chunkTextLength(visibleChunks)
  const padding = Math.max(0, contentWidth - CELL_PREFIX_WIDTH - visibleWidth)
  const content = new StyledText([
    ...(leftBorder ? [changeBarChunk(side, "left", row, leftBorder)] : []),
    ...diffPrefixChunks(prefixMarker, line, fg, bg),
    ...visibleChunks,
    ...(padding > 0 ? [makeChunk(" ".repeat(padding), fg, bg)] : []),
    changeBarChunk(side, "right", row, rightBorder),
  ])

  return Text({
    content,
    fg,
    height: 1,
    truncate: true,
  })
}

function diffPrefixChunks(marker: string, line: string, fg: ColorInput, bg: ColorInput | undefined): TextChunk[] {
  return [makeChunk(`${marker}${line} `, fg, bg)]
}

function changeBarChunk(side: "old" | "new", edge: "left" | "right", row: DiffRow, fallback: string): TextChunk {
  const color = changeBarColor(side, edge, row)
  return color ? makeChunk("█", color) : makeChunk(fallback, colors.border)
}

function changeBarColor(side: "old" | "new", edge: "left" | "right", row: DiffRow): ColorInput | undefined {
  if (side === "old" && edge === "left") return rowHasOldChange(row) ? colors.del : undefined
  if (side === "old" && edge === "right") return rowHasNewChange(row) ? colors.add : undefined
  if (side === "new" && edge === "left") return rowHasNewChange(row) ? colors.add : undefined
  return undefined
}

function rowHasOldChange(row: DiffRow): boolean {
  return row.kind === "delete" || row.kind === "modify"
}

function rowHasNewChange(row: DiffRow): boolean {
  return row.kind === "add" || row.kind === "modify"
}

function applyCellBg(chunks: TextChunk[], bg: ColorInput | undefined): TextChunk[] {
  if (!bg) return chunks
  return chunks.map((chunk) => ({ ...chunk, bg: makeChunk("", undefined, bg).bg }))
}

function renderEmptyDiffRow(metrics: RenderMetrics, layout: DiffLayout) {
  if (layout === "stacked") {
    return Box(
      {
        width: "100%",
        height: 1,
        flexDirection: "row",
        backgroundColor: colors.bg,
      },
      renderEmptyDiffCell(metrics.cols, true),
    )
  }

  return Box(
    {
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: colors.bg,
    },
    renderEmptyDiffCell(metrics.paneWidth, true),
    renderEmptyDiffCell(metrics.cols - metrics.paneWidth, false),
  )
}

function renderEmptyDiffCell(paneWidth: number, includeLeftBorder: boolean) {
  const leftBorder = includeLeftBorder ? "│" : ""
  const rightBorder = "│"
  const borderWidth = leftBorder.length + rightBorder.length
  const contentWidth = Math.max(8, paneWidth - borderWidth)

  return Text({
    content: `${leftBorder}${" ".repeat(contentWidth)}${rightBorder}`,
    fg: colors.border,
    bg: colors.bg,
    height: 1,
    truncate: true,
  })
}

function renderDiffBorder(position: "top" | "bottom", metrics: RenderMetrics, layout: DiffLayout) {
  if (layout === "stacked") {
    const chars = position === "top" ? { left: "┌", right: "┐" } : { left: "└", right: "┘" }

    return Text({
      content: `${chars.left}${"─".repeat(Math.max(0, metrics.cols - 2))}${chars.right}`,
      fg: colors.border,
      bg: colors.bg,
      height: 1,
      truncate: true,
    })
  }

  const leftWidth = metrics.paneWidth - 2
  const rightWidth = metrics.cols - metrics.paneWidth - 1
  const chars =
    position === "top"
      ? { left: "┌", middle: "┬", right: "┐" }
      : { left: "└", middle: "┴", right: "┘" }

  return Text({
    content: `${chars.left}${"─".repeat(Math.max(0, leftWidth))}${chars.middle}${"─".repeat(Math.max(0, rightWidth))}${chars.right}`,
    fg: colors.border,
    bg: colors.bg,
    height: 1,
    truncate: true,
  })
}

function renderStatusBar(state: AppState, metrics: RenderMetrics) {
  const inlineLabel = state.lineDiffType === "none" ? "off" : state.lineDiffType
  const wrapLabel = state.wrap ? "on" : "off"
  const right =
    state.message ??
    `s ${state.diffLayout}  W wrap:${wrapLabel}  i inline:${inlineLabel}  c viewed  h/l horiz  tab tabs  w/b hunks+tabs  ? help  q quit `
  const gap = Math.max(0, metrics.cols - right.length)

  return Text({
    content: `${" ".repeat(gap)}${right}`,
    fg: colors.text,
    bg: colors.panel,
    height: 1,
    truncate: true,
  })
}

function renderHelpOverlay(metrics: RenderMetrics) {
  const width = Math.min(74, Math.max(48, metrics.cols - 8))
  const left = Math.max(2, Math.floor((metrics.cols - width) / 2))

  return Box(
    {
      position: "absolute",
      top: 5,
      left,
      width,
      height: 19,
      flexDirection: "column",
      backgroundColor: colors.bg,
      border: true,
      borderColor: colors.active,
      paddingX: 2,
      paddingY: 1,
      zIndex: 10,
    },
    Text({ content: "glimpse help", fg: colors.active, attributes: TextAttributes.BOLD, height: 1 }),
    Text({ content: "h/l, left/right    scroll diff horizontally", fg: colors.text, height: 1 }),
    Text({ content: "shift+w            toggle word wrap", fg: colors.text, height: 1 }),
    Text({ content: "s                  toggle stacked/side-by-side", fg: colors.text, height: 1 }),
    Text({ content: "i                  cycle inline diff word-alt/word/char/off", fg: colors.text, height: 1 }),
    Text({ content: "tab/shift+tab      next/previous tab", fg: colors.text, height: 1 }),
    Text({ content: "[/] or p/n          previous/next tab", fg: colors.text, height: 1 }),
    Text({ content: "{/}                previous/next hunk", fg: colors.text, height: 1 }),
    Text({ content: "w/b                next/previous hunk, then tab", fg: colors.text, height: 1 }),
    Text({ content: "j/k, up/down       scroll diff by line", fg: colors.text, height: 1 }),
    Text({ content: "ctrl+d/ctrl+u      scroll diff", fg: colors.text, height: 1 }),
    Text({ content: "space/pageup       page scroll", fg: colors.text, height: 1 }),
    Text({ content: "gg/G               top/bottom", fg: colors.text, height: 1 }),
    Text({ content: "c                  toggle viewed", fg: colors.text, height: 1 }),
    Text({ content: "C                  unmark viewed", fg: colors.text, height: 1 }),
    Text({ content: "?                  toggle help", fg: colors.text, height: 1 }),
    Text({ content: "q / esc            close help", fg: colors.text, height: 1 }),
  )
}

function markerFor(side: "old" | "new", row: DiffRow): string {
  if (row.kind === "context") return " "
  if (row.kind === "modify") return side === "old" ? "~" : "~"
  if (row.kind === "delete") return side === "old" ? "-" : " "
  if (row.kind === "add") return side === "new" ? "+" : " "
  return " "
}

function fgFor(side: "old" | "new", row: DiffRow): ColorInput {
  if (row.kind === "context") return colors.muted
  if (row.kind === "modify") return side === "old" ? colors.del : colors.add
  if (row.kind === "delete") return side === "old" ? colors.del : colors.subtle
  if (row.kind === "add") return side === "new" ? colors.add : colors.subtle
  return colors.text
}

function bgFor(side: "old" | "new", row: DiffRow): ColorInput | undefined {
  if (row.kind === "modify") return side === "old" ? colors.delBg : colors.addBg
  if (row.kind === "delete") return side === "old" ? colors.delBg : undefined
  if (row.kind === "add") return side === "new" ? colors.addBg : undefined
  return undefined
}

function statusBadge(status: FileStatus): string {
  switch (status) {
    case "added":
      return "a"
    case "deleted":
      return "d"
    case "renamed":
      return "r"
    case "binary":
      return "b"
    case "modified":
      return "m"
  }
}

function colorForStatus(status: FileStatus): ColorInput {
  switch (status) {
    case "added":
      return colors.add
    case "deleted":
      return colors.del
    case "renamed":
      return colors.warn
    case "binary":
      return colors.command
    case "modified":
      return colors.text
  }
}

type RenderTab = {
  index: number
  selected: boolean
  status: FileStatus
  path: string
  viewed: boolean
}

function preferredTabWidth(tab: RenderTab | undefined): number {
  if (!tab) return 0
  return renderTabText(tab, tab.selected ? 34 : 24).length + 1
}

function renderTabText(tab: RenderTab, width: number): string {
  if (width <= 0) return ""

  const prefix = tab.viewed ? "✓ " : ""
  const chromeWidth = 2 + prefix.length
  if (width <= chromeWidth) return truncate(` ${prefix.trimStart()}`, width)

  const labelWidth = width - chromeWidth
  const preferredLabelWidth = Math.min(labelWidth, tab.selected ? 30 : 20)
  const label = truncate(compactPath(tab.path, preferredLabelWidth), labelWidth)
  return ` ${prefix}${label} `
}

function compactPath(path: string, width: number): string {
  if (path.length <= width) return path
  const parts = path.split("/")
  if (parts.length <= 2) return path
  const basename = parts.at(-1) ?? path
  const parent = parts.at(-2) ?? ""
  const compact = `${parent}/${basename}`
  return compact.length <= width ? compact : path
}

function truncate(value: string, width: number): string {
  if (width <= 0) return ""
  if (value.length <= width) return value
  if (width <= 1) return value.slice(0, width)
  return `${value.slice(0, width - 1)}…`
}

function getMetrics(): RenderMetrics {
  const rows = process.stdout.rows ?? 32
  const cols = process.stdout.columns ?? 120
  return {
    rows,
    cols,
    bodyRows: Math.max(4, rows - 8),
    paneWidth: Math.max(20, Math.floor(cols / 2)),
  }
}

function metricsWithCols(metrics: RenderMetrics, cols: number): RenderMetrics {
  const nextCols = Math.max(20, cols)
  return {
    ...metrics,
    cols: nextCols,
    paneWidth: Math.max(20, Math.floor(nextCols / 2)),
  }
}

function rowLayoutOptionsForMetrics(state: AppState, metrics: RenderMetrics): RowLayoutOptions {
  const fullTextWidth = cellTextWidth(metrics.cols, 2)
  const oldTextWidth = state.diffLayout === "stacked" ? fullTextWidth : cellTextWidth(metrics.paneWidth, 2)
  const newTextWidth =
    state.diffLayout === "stacked" ? fullTextWidth : cellTextWidth(metrics.cols - metrics.paneWidth, 1)

  return {
    layout: state.diffLayout,
    wrap: state.wrap,
    oldTextWidth,
    newTextWidth,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
