import { afterEach, describe, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { findNestedGitRepos, loadDiffSet, prefixDiffFile } from "../src/diff-source"
import type { DiffFile } from "../src/types"

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

describe("multi-repo diff source helpers", () => {
  test("finds nested git repos and does not descend into a discovered repo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "glimpse-repos-"))
    tempRoots.push(root)

    await mkdir(path.join(root, "api", ".git"), { recursive: true })
    await mkdir(path.join(root, "api", "vendor", "ignored", ".git"), { recursive: true })
    await mkdir(path.join(root, "web", "nested"), { recursive: true })
    await writeFile(path.join(root, "web", "nested", ".git"), "gitdir: ../../.git/worktrees/web\n")

    const repos = await findNestedGitRepos(root)

    expect(repos.map((repo) => path.relative(root, repo))).toEqual(["api", "web/nested"])
  })

  test("prefixes file paths with the repo label for tab identity", () => {
    const file: DiffFile = {
      oldPath: "src/app.ts",
      newPath: "src/app.ts",
      displayPath: "src/app.ts",
      status: "modified",
      stats: { added: 1, deleted: 1 },
      hunks: [],
    }

    expect(prefixDiffFile(file, "packages/api")).toMatchObject({
      oldPath: "packages/api/src/app.ts",
      newPath: "packages/api/src/app.ts",
      displayPath: "packages/api/src/app.ts",
    })
  })

  test("prefixes both sides of renamed files", () => {
    const file: DiffFile = {
      oldPath: "old.ts",
      newPath: "new.ts",
      displayPath: "old.ts -> new.ts",
      status: "renamed",
      stats: { added: 1, deleted: 1 },
      hunks: [],
    }

    expect(prefixDiffFile(file, "tooling")).toMatchObject({
      oldPath: "tooling/old.ts",
      newPath: "tooling/new.ts",
      displayPath: "tooling/old.ts -> tooling/new.ts",
    })
  })

  test("loads changed files across nested repos from a non-repo folder", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "glimpse-multi-repo-"))
    tempRoots.push(root)
    const originalCwd = process.cwd()

    await createChangedRepo(path.join(root, "api"), "src/api.ts")
    await createChangedRepo(path.join(root, "web"), "app/page.tsx")

    try {
      process.chdir(root)
      const diffSet = await loadDiffSet({ staged: false, stdin: false, file: null, range: null })

      expect(diffSet.source).toMatchObject({ kind: "multi-repo", repoCount: 2 })
      expect(diffSet.files.map((file) => file.displayPath)).toEqual(["api/src/api.ts", "web/app/page.tsx"])
    } finally {
      process.chdir(originalCwd)
    }
  })
})

async function createChangedRepo(repoPath: string, filePath: string): Promise<void> {
  await mkdir(path.join(repoPath, path.dirname(filePath)), { recursive: true })
  await $`git init ${repoPath}`.quiet()
  await writeFile(path.join(repoPath, filePath), "export const value = 1\n")
  await $`git -C ${repoPath} add ${filePath}`.quiet()
  await writeFile(path.join(repoPath, filePath), "export const value = 2\n")
}
