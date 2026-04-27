import { createCliRenderer, type KeyEvent } from "@opentui/core"
import { renderApp } from "./render"
import {
  createInitialState,
  currentScrollX,
  currentScrollY,
  cycleLineDiffType,
  diffRowVisualRowCount,
  moveFile,
  moveHunk,
  moveHunkOrFile,
  setScrollX,
  setScrollY,
  toggleCurrentFileViewed,
  toggleDiffLayout,
  toggleHelp,
  toggleWrap,
  unmarkCurrentFileViewed,
} from "./state"
import {
  fileVisualRowCount as layoutFileVisualRowCount,
  hunkIndexForScrollY,
  type RowLayoutOptions,
} from "./row-layout"
import { cellTextWidth } from "./cell-metrics"
import { createSyntaxState, primeSyntaxForFile } from "./syntax"
import { theme } from "./theme"
import type { AppState, DiffSet } from "./types"

export async function runApp(diffSet: DiffSet): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    screenMode: "alternate-screen",
    consoleMode: "disabled",
    backgroundColor: theme.bg,
    targetFps: 30,
  })

  let state = createInitialState(diffSet)
  const syntaxState = createSyntaxState()
  let pendingG = false
  let closed = false
  const update = (next: AppState, options?: { syncActiveHunkFromScroll?: boolean }) => {
    state = boundScroll(next, options)
    renderApp(renderer, state, syntaxState)
    primeActiveSyntax()
  }

  const primeActiveSyntax = () => {
    const file = state.diffSet.files[state.activeFileIndex]
    if (!file) return

    const activePath = file.displayPath
    primeSyntaxForFile(syntaxState, file, () => {
      if (closed) return
      if (state.diffSet.files[state.activeFileIndex]?.displayPath !== activePath) return
      renderApp(renderer, state, syntaxState)
    })
  }

  renderApp(renderer, state, syntaxState)
  primeActiveSyntax()

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    const clearPendingG = () => {
      pendingG = false
    }

    if (key.name === "?") {
      clearPendingG()
      update(toggleHelp(state))
      return
    }

    if (state.mode === "help") {
      clearPendingG()
      update(toggleHelp(state))
      return
    }

    if (key.name === "q" || key.name === "escape") {
      closed = true
      void syntaxState.client.destroy().finally(() => {
        renderer.destroy()
      })
      return
    }

    const page = Math.max(4, (process.stdout.rows ?? 32) - 10)

    if (isLowerG(key)) {
      if (pendingG) {
        clearPendingG()
      update(setScrollY(state, 0, rowLayoutOptionsForTerminal(state)))
        return
      }

      pendingG = true
      return
    }

    clearPendingG()

    if (isUpperG(key)) {
      update(setScrollY(state, Number.MAX_SAFE_INTEGER, rowLayoutOptionsForTerminal(state)))
      return
    }

    if (isLowerC(key)) {
      update(toggleCurrentFileViewed(state))
      return
    }

    if (isUpperC(key)) {
      update(unmarkCurrentFileViewed(state))
      return
    }

    if (key.name === "s" && !key.ctrl && !key.shift && key.sequence !== "S") {
      update(toggleDiffLayout(state))
      return
    }

    if (key.name === "W" || key.sequence === "W" || (key.name === "w" && key.shift)) {
      update(toggleWrap(state))
      return
    }

    if (key.name === "i" && !key.ctrl && !key.shift && key.sequence !== "I") {
      update(cycleLineDiffType(state))
      return
    }

    if (key.name === "tab" && key.shift) {
      update(moveFile(state, -1))
      return
    }

    if (key.name === "tab" || key.name === "n" || key.name === "]") {
      update(moveFile(state, 1))
      return
    }

    if (key.name === "p" || key.name === "[") {
      update(moveFile(state, -1))
      return
    }

    if (key.name === "l" || key.name === "right") {
      update(setScrollX(state, currentScrollX(state) + 4))
      return
    }

    if (key.name === "h" || key.name === "left") {
      update(setScrollX(state, currentScrollX(state) - 4))
      return
    }

    if (key.name === "}" || key.sequence === "}") {
      update(moveHunk(state, 1, rowLayoutOptionsForTerminal(state)), { syncActiveHunkFromScroll: false })
      return
    }

    if (key.name === "{" || key.sequence === "{") {
      update(moveHunk(state, -1, rowLayoutOptionsForTerminal(state)), { syncActiveHunkFromScroll: false })
      return
    }

    if (key.name === "w" && !key.ctrl && !key.shift && key.sequence !== "W") {
      update(moveHunkOrFile(state, 1, rowLayoutOptionsForTerminal(state)), { syncActiveHunkFromScroll: false })
      return
    }

    if (key.name === "b" && !key.ctrl && !key.shift && key.sequence !== "B") {
      update(moveHunkOrFile(state, -1, rowLayoutOptionsForTerminal(state)), { syncActiveHunkFromScroll: false })
      return
    }

    if (key.name === "j" || key.name === "down") {
      update(setScrollY(state, currentScrollY(state) + 1, rowLayoutOptionsForTerminal(state)))
      return
    }

    if (key.name === "k" || key.name === "up") {
      update(setScrollY(state, currentScrollY(state) - 1, rowLayoutOptionsForTerminal(state)))
      return
    }

    if (key.ctrl && key.name === "d") {
      update(setScrollY(state, currentScrollY(state) + Math.floor(page / 2), rowLayoutOptionsForTerminal(state)))
      return
    }

    if (key.ctrl && key.name === "u") {
      update(setScrollY(state, currentScrollY(state) - Math.floor(page / 2), rowLayoutOptionsForTerminal(state)))
      return
    }

    if (key.name === "space" || key.name === "pagedown") {
      update(setScrollY(state, currentScrollY(state) + page, rowLayoutOptionsForTerminal(state)))
      return
    }

    if (key.name === "pageup") {
      update(setScrollY(state, currentScrollY(state) - page, rowLayoutOptionsForTerminal(state)))
      return
    }

  })

  process.stdout.on("resize", () => {
    renderApp(renderer, state, syntaxState)
    primeActiveSyntax()
  })
}

function boundScroll(state: AppState, options: { syncActiveHunkFromScroll?: boolean } = {}): AppState {
  const file = state.diffSet.files[state.activeFileIndex]
  if (!file) return state
  const layoutOptions = rowLayoutOptionsForTerminal(state)
  const rowCount = layoutFileVisualRowCount(file, layoutOptions)
  const viewportRows = Math.max(1, (process.stdout.rows ?? 32) - 8)
  const maxScroll = Math.max(0, rowCount - viewportRows)
  const maxScrollX = state.wrap
    ? 0
    : file.hunks.reduce(
        (max, hunk) =>
          hunk.rows.reduce((rowMax, row) => {
            const oldOverflow = Math.max(0, (row.oldText?.length ?? 0) - layoutOptions.oldTextWidth)
            const newOverflow = Math.max(0, (row.newText?.length ?? 0) - layoutOptions.newTextWidth)
            const stackedPair = diffRowVisualRowCount(row, state.diffLayout) > 1
            const hasOld = state.diffLayout === "side-by-side" || row.oldText !== null || stackedPair
            const hasNew = state.diffLayout === "side-by-side" || row.newText !== null || stackedPair
            return Math.max(rowMax, hasOld ? oldOverflow : 0, hasNew ? newOverflow : 0)
          }, max),
        0,
      )
  const scrollY = Math.min(currentScrollY(state), maxScroll)
  const clampedY =
    options.syncActiveHunkFromScroll === false
      ? {
          ...state,
          scrollYByPath: {
            ...state.scrollYByPath,
            [file.displayPath]: scrollY,
          },
        }
      : setScrollY(
          {
            ...state,
            activeHunkIndex: hunkIndexForScrollY(file, scrollY, layoutOptions),
          },
          scrollY,
          layoutOptions,
        )
  return setScrollX(clampedY, Math.min(currentScrollX(state), maxScrollX))
}

function rowLayoutOptionsForTerminal(state: AppState): RowLayoutOptions {
  const terminalCols = process.stdout.columns ?? 120
  const cols = terminalCols > 40 ? terminalCols - 1 : terminalCols
  const paneWidth = Math.max(20, Math.floor(cols / 2))
  const fullTextWidth = cellTextWidth(cols, 2)
  const oldTextWidth = state.diffLayout === "stacked" ? fullTextWidth : cellTextWidth(paneWidth, 2)
  const newTextWidth = state.diffLayout === "stacked" ? fullTextWidth : cellTextWidth(cols - paneWidth, 1)

  return {
    layout: state.diffLayout,
    wrap: state.wrap,
    oldTextWidth,
    newTextWidth,
  }
}

function isLowerG(key: KeyEvent): boolean {
  return key.name === "g" && !key.shift && key.sequence !== "G"
}

function isUpperG(key: KeyEvent): boolean {
  return key.name === "G" || key.sequence === "G" || (key.name === "g" && key.shift)
}

function isLowerC(key: KeyEvent): boolean {
  return key.name === "c" && !key.ctrl && !key.shift && key.sequence !== "C"
}

function isUpperC(key: KeyEvent): boolean {
  return !key.ctrl && (key.name === "C" || key.sequence === "C" || (key.name === "c" && key.shift))
}
