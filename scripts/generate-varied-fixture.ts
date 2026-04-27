type Hunk = {
  header: string
  lines: string[]
}

type TextFilePatch = {
  path: string
  oldHash: string
  newHash: string
  hunks: Hunk[]
}

type NewFilePatch = {
  path: string
  newHash: string
  lines: string[]
}

const services = [
  "auth/session.ts",
  "billing/invoice-rules.ts",
  "search/query-planner.ts",
  "sync/retry-policy.ts",
  "ui/diff-panel.tsx",
  "ui/keyboard-shortcuts.ts",
  "data/customer-rollup.sql",
  "data/migrations/20260426_add_audit_events.sql",
  "docs/release-runbook.md",
  "docs/support-playbook.md",
  "config/routes.yaml",
  "config/feature-flags.json",
  "packages/cli/commands/review.ts",
  "packages/cli/commands/export.ts",
  "packages/render/line-layout.ts",
  "packages/render/theme-tokens.ts",
  "test/session-cache.test.ts",
  "test/query-planner.test.ts",
  "scripts/collect-metrics.ts",
  "scripts/prune-preview-artifacts.ts",
  "examples/api-client.ts",
  "examples/glimpse-theme.ts",
  "storybook/diff-panel.stories.tsx",
  "storybook/navigation.stories.tsx",
]

const nouns = [
  "session window",
  "invoice batch",
  "query graph",
  "retry lane",
  "diff viewport",
  "shortcut map",
  "customer ledger",
  "audit stream",
  "release checklist",
  "support escalation",
  "route table",
  "flag registry",
  "review command",
  "export command",
  "line measurement",
  "theme palette",
  "cache behavior",
  "planner branch",
  "metrics collector",
  "artifact pruner",
  "client example",
  "theme example",
  "panel story",
  "navigation story",
]

const verbs = [
  "normalizes",
  "hydrates",
  "reconciles",
  "debounces",
  "annotates",
  "indexes",
  "compresses",
  "validates",
  "streams",
  "summarizes",
  "partitions",
  "projects",
]

const tags = [
  "cold-start",
  "warm-path",
  "operator-mode",
  "shared-cache",
  "terminal-safe",
  "audit-ready",
  "high-volume",
  "quiet-default",
]

const lines: string[] = []

function hash(seed: number, offset: number) {
  return (seed * 4099 + offset * 131 + 0xabcde).toString(16).slice(0, 7).padEnd(7, "0")
}

function pushTextPatch(patch: TextFilePatch) {
  lines.push(`diff --git a/${patch.path} b/${patch.path}`)
  lines.push(`index ${patch.oldHash}..${patch.newHash} 100644`)
  lines.push(`--- a/${patch.path}`)
  lines.push(`+++ b/${patch.path}`)
  for (const hunk of patch.hunks) {
    lines.push(hunk.header)
    lines.push(...hunk.lines)
  }
}

function pushNewFile(patch: NewFilePatch) {
  lines.push(`diff --git a/${patch.path} b/${patch.path}`)
  lines.push("new file mode 100644")
  lines.push(`index 0000000..${patch.newHash}`)
  lines.push("--- /dev/null")
  lines.push(`+++ b/${patch.path}`)
  lines.push(`@@ -0,0 +1,${patch.lines.length} @@`)
  lines.push(...patch.lines.map((line) => `+${line}`))
}

function sourceLine(fileIndex: number, hunkIndex: number, lineIndex: number) {
  const noun = nouns[fileIndex % nouns.length]
  const verb = verbs[(fileIndex + hunkIndex + lineIndex) % verbs.length]
  const tag = tags[(fileIndex * 3 + lineIndex) % tags.length]
  return ` const step${hunkIndex}_${lineIndex} = "${noun} ${verb} ${tag} path ${fileIndex}.${lineIndex}"`
}

for (let fileIndex = 0; fileIndex < services.length; fileIndex += 1) {
  const path = services[fileIndex]!
  const noun = nouns[fileIndex]!
  const hunks: Hunk[] = []

  for (let hunkIndex = 0; hunkIndex < 3; hunkIndex += 1) {
    const oldStart = hunkIndex * 56 + 4
    const newStart = hunkIndex * 60 + 4
    const hunkLines: string[] = []

    for (let contextIndex = 0; contextIndex < 8; contextIndex += 1) {
      hunkLines.push(sourceLine(fileIndex, hunkIndex, contextIndex))
    }

    const baseName = path.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_")
    hunkLines.push(`-const ${baseName}_${hunkIndex}_mode = "legacy-${noun}"`)
    hunkLines.push(`+const ${baseName}_${hunkIndex}_mode = "current-${noun}"`)
    hunkLines.push(`-const ${baseName}_${hunkIndex}_limit = ${24 + fileIndex + hunkIndex}`)
    hunkLines.push(`+const ${baseName}_${hunkIndex}_limit = ${48 + fileIndex * 2 + hunkIndex}`)
    hunkLines.push(`+const ${baseName}_${hunkIndex}_owner = "${tags[(fileIndex + hunkIndex) % tags.length]}"`)

    for (let changeIndex = 0; changeIndex < 5; changeIndex += 1) {
      const verb = verbs[(fileIndex + hunkIndex + changeIndex) % verbs.length]
      const tag = tags[(fileIndex + changeIndex) % tags.length]
      hunkLines.push(`-queue("${noun}", "${verb}", { priority: ${changeIndex}, tag: "legacy" })`)
      hunkLines.push(`+queue("${noun}", "${verb}", { priority: ${changeIndex + 1}, tag: "${tag}", trace: "${fileIndex}-${hunkIndex}-${changeIndex}" })`)
    }

    hunks.push({
      header: `@@ -${oldStart},20 +${newStart},23 @@ function configure${fileIndex}Hunk${hunkIndex}()`,
      lines: hunkLines,
    })
  }

  pushTextPatch({
    path,
    oldHash: hash(fileIndex + 1, 1),
    newHash: hash(fileIndex + 1, 2),
    hunks,
  })
}

pushNewFile({
  path: "docs/large-varied-sample.md",
  newHash: "b7a5510",
  lines: [
    "# large varied sample",
    "",
    "this fixture exercises tab navigation with files that do not all read like generated modules.",
    "",
    ...services.map((path, index) => `- ${path}: updates the ${nouns[index]!} with ${tags[index % tags.length]!} behavior.`),
  ],
})

lines.push("diff --git a/assets/screenshots/glimpse-large-varied.png b/assets/screenshots/glimpse-large-varied.png")
lines.push("new file mode 100644")
lines.push("index 0000000..a17f002")
lines.push("Binary files /dev/null and b/assets/screenshots/glimpse-large-varied.png differ")

await Bun.write("fixtures/large-varied-sample.diff", `${lines.join("\n")}\n`)

console.log(`wrote fixtures/large-varied-sample.diff with ${lines.length} lines across ${services.length + 2} files`)
