import { $ } from "bun"
import { parseUnifiedDiff } from "./parser"
import type { DiffSet, DiffSource } from "./types"

export type CliOptions = {
  staged: boolean
  stdin: boolean
  file: string | null
  range: string | null
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    staged: false,
    stdin: false,
    file: null,
    range: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg) continue

    if (arg === "--staged" || arg === "--cached") {
      options.staged = true
    } else if (arg === "--stdin") {
      options.stdin = true
    } else if (arg === "--file") {
      const value = argv[index + 1]
      if (!value) throw new Error("--file needs a path")
      options.file = value
      index += 1
    } else if (arg === "--help" || arg === "-h") {
      throw new HelpRequested()
    } else if (!arg.startsWith("-") && !options.range) {
      options.range = arg
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }

  return options
}

export class HelpRequested extends Error {}

export async function loadDiffSet(options: CliOptions): Promise<DiffSet> {
  if (options.stdin) {
    const raw = await new Response(Bun.stdin.stream()).text()
    return parseUnifiedDiff(raw, { kind: "stdin", label: "stdin" })
  }

  if (options.file) {
    const raw = await Bun.file(options.file).text()
    return parseUnifiedDiff(raw, { kind: "file", label: options.file, path: options.file })
  }

  const source = sourceFromOptions(options)
  const raw = await runGitDiff(options)
  return parseUnifiedDiff(raw, source)
}

function sourceFromOptions(options: CliOptions): DiffSource {
  if (options.staged) return { kind: "staged", label: "staged" }
  if (options.range) return { kind: "range", label: options.range, range: options.range }
  return { kind: "unstaged", label: "unstaged" }
}

async function runGitDiff(options: CliOptions): Promise<string> {
  try {
    if (options.staged) {
      return await $`git diff --cached --no-ext-diff --no-color --find-renames`.text()
    }

    if (options.range) {
      return await $`git diff --no-ext-diff --no-color --find-renames ${options.range}`.text()
    }

    return await $`git diff --no-ext-diff --no-color --find-renames`.text()
  } catch (error) {
    throw new Error(`could not load git diff: ${String(error)}`)
  }
}

export function usage(): string {
  return [
    "glimpse",
    "",
    "usage:",
    "  glimpse",
    "  glimpse --staged",
    "  glimpse main...HEAD",
    "  glimpse --stdin",
    "  glimpse --file patch.diff",
    "",
    "keys:",
    "  h/l or left/right   scroll diff horizontally",
    "  shift+w             toggle word wrap",
    "  s                   toggle stacked/side-by-side",
    "  tab/shift+tab       next/previous file tab",
    "  [/] or p/n          previous/next file tab",
    "  {/}                 previous/next hunk",
    "  w/b                 next/previous hunk, then file tab",
    "  j/k or up/down      scroll diff",
    "  ctrl+d/ctrl+u       scroll",
    "  space/pageup        page scroll",
    "  gg/G                top/bottom",
    "  c                   toggle viewed",
    "  C                   unmark viewed",
    "  ?                   help",
    "  q                   quit",
  ].join("\n")
}
