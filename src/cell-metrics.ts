export const CELL_PREFIX_WIDTH = 6
export const CELL_RIGHT_PADDING = 2

export function cellTextWidth(paneWidth: number, borderWidth: number): number {
  const contentWidth = Math.max(8, paneWidth - borderWidth)
  return Math.max(1, contentWidth - CELL_PREFIX_WIDTH - CELL_RIGHT_PADDING)
}
