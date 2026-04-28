import { $ } from "bun"
import type { Dirent } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { parseUnifiedDiff } from "./parser"
import type { DiffFile, DiffSet, DiffSource } from "./types"

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

  if (!(await isInsideGitWorkTree())) {
    return await loadNestedRepoDiffSet(options)
  }

  const source = sourceFromOptions(options)
  const raw = await runGitDiff(options, ".")
  return parseUnifiedDiff(raw, source)
}

function sourceFromOptions(options: CliOptions): DiffSource {
  if (options.staged) return { kind: "staged", label: "staged" }
  if (options.range) return { kind: "range", label: options.range, range: options.range }
  return { kind: "unstaged", label: "unstaged" }
}

async function loadNestedRepoDiffSet(options: CliOptions): Promise<DiffSet> {
  const repoPaths = await findNestedGitRepos(process.cwd())
  if (repoPaths.length === 0) {
    throw new Error("not in a git repo, and no git repos were found below this directory")
  }

  if (repoPaths.length > 5) {
    const confirmed = await confirmNestedRepoReview(repoPaths.length)
    if (!confirmed) {
      throw new Error("cancelled multi-repo review")
    }
  }

  const files: DiffFile[] = []
  const rawParts: string[] = []

  for (const repoPath of repoPaths) {
    const raw = await runGitDiff(options, repoPath)
    rawParts.push(raw)

    const parsed = parseUnifiedDiff(raw, sourceFromOptions(options))
    const repoLabel = path.relative(process.cwd(), repoPath) || path.basename(repoPath)
    files.push(...parsed.files.map((file) => prefixDiffFile(file, repoLabel)))
  }

  return {
    source: {
      kind: "multi-repo",
      label: `multi-repo (${repoPaths.length} repos)`,
      repoCount: repoPaths.length,
    },
    files,
    raw: rawParts.join("\n"),
  }
}

async function isInsideGitWorkTree(): Promise<boolean> {
  try {
    const result = await $`git rev-parse --is-inside-work-tree`.quiet().text()
    return result.trim() === "true"
  } catch {
    return false
  }
}

export async function findNestedGitRepos(root: string): Promise<string[]> {
  const repos: string[] = []

  async function visit(directory: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    if (entries.some((entry) => entry.name === ".git")) {
      repos.push(directory)
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === ".git" || entry.name === "node_modules") continue
      await visit(path.join(directory, entry.name))
    }
  }

  await visit(root)
  return repos.sort((left, right) => left.localeCompare(right))
}

export function prefixDiffFile(file: DiffFile, repoLabel: string): DiffFile {
  const prefix = repoLabel.replace(/\/+$/, "")
  const prefixPath = (value: string | null) => (value ? `${prefix}/${value}` : value)

  return {
    ...file,
    oldPath: prefixPath(file.oldPath),
    newPath: prefixPath(file.newPath),
    displayPath:
      file.status === "renamed" && file.oldPath && file.newPath
        ? `${prefix}/${file.oldPath} -> ${prefix}/${file.newPath}`
        : `${prefix}/${file.displayPath}`,
  }
}

async function confirmNestedRepoReview(repoCount: number): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error(`found ${repoCount} git repos below this directory; rerun from a narrower folder`)
  }

  process.stdout.write(`found ${repoCount} git repos below this directory. review all of them? [y/n] `)

  for await (const chunk of Bun.stdin.stream()) {
    const answer = new TextDecoder().decode(chunk).trim().toLowerCase()
    if (answer === "y" || answer === "yes") return true
    if (answer === "n" || answer === "no" || answer === "") return false
    process.stdout.write("please answer y or n: ")
  }

  return false
}

async function runGitDiff(options: CliOptions, cwd: string): Promise<string> {
  try {
    if (options.staged) {
      return await $`git -C ${cwd} diff --cached --no-ext-diff --no-color --find-renames`.text()
    }

    if (options.range) {
      return await $`git -C ${cwd} diff --no-ext-diff --no-color --find-renames ${options.range}`.text()
    }

    return await $`git -C ${cwd} diff --no-ext-diff --no-color --find-renames`.text()
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
    "when run outside a git repo, glimpse scans nested folders for git repos.",
    "if it finds 1-5 repos, it opens their diffs together; above 5, it asks first.",
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
