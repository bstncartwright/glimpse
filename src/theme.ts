import { RGBA, type ColorInput } from "@opentui/core"

export type TerminalTheme = {
  bg: ColorInput
  panel: ColorInput
  border: ColorInput
  text: ColorInput
  muted: ColorInput
  subtle: ColorInput
  active: ColorInput
  activeTabText: ColorInput
  activeTabBg: ColorInput
  add: ColorInput
  del: ColorInput
  addBg: ColorInput
  delBg: ColorInput
  addInlineBg: ColorInput
  delInlineBg: ColorInput
  warn: ColorInput
  command: ColorInput
  syntax: {
    keyword: ColorInput
    string: ColorInput
    number: ColorInput
    comment: ColorInput
    type: ColorInput
    function: ColorInput
    property: ColorInput
    variable: ColorInput
    punctuation: ColorInput
  }
}

export const theme: TerminalTheme = {
  bg: RGBA.defaultBackground(),
  panel: RGBA.defaultBackground(),
  border: RGBA.fromIndex(8),
  text: RGBA.defaultForeground(),
  muted: RGBA.fromIndex(8),
  subtle: RGBA.fromIndex(8),
  active: RGBA.fromIndex(14),
  activeTabText: RGBA.fromIndex(15),
  activeTabBg: RGBA.fromIndex(4),
  add: RGBA.fromIndex(10),
  del: RGBA.fromIndex(9),
  addBg: RGBA.fromInts(18, 46, 37),
  delBg: RGBA.fromInts(60, 28, 26),
  addInlineBg: RGBA.fromInts(35, 92, 64),
  delInlineBg: RGBA.fromInts(116, 50, 44),
  warn: RGBA.fromIndex(11),
  command: RGBA.fromIndex(14),
  syntax: {
    keyword: RGBA.fromIndex(13),
    string: RGBA.fromIndex(10),
    number: RGBA.fromIndex(11),
    comment: RGBA.fromIndex(8),
    type: RGBA.fromIndex(14),
    function: RGBA.fromIndex(12),
    property: RGBA.fromIndex(6),
    variable: RGBA.defaultForeground(),
    punctuation: RGBA.fromIndex(8),
  },
}
