const fileCount = 42
const hunksPerFile = 4
const contextPerHunk = 10
const changesPerHunk = 12

const lines: string[] = []

for (let fileIndex = 1; fileIndex <= fileCount; fileIndex += 1) {
  const name = `src/generated/module-${String(fileIndex).padStart(2, "0")}.ts`
  const oldHash = String(fileIndex).repeat(7).slice(0, 7)
  const newHash = String(fileIndex + 1).repeat(7).slice(0, 7)

  lines.push(`diff --git a/${name} b/${name}`)
  lines.push(`index ${oldHash}..${newHash} 100644`)
  lines.push(`--- a/${name}`)
  lines.push(`+++ b/${name}`)

  for (let hunkIndex = 0; hunkIndex < hunksPerFile; hunkIndex += 1) {
    const oldStart = hunkIndex * 80 + 1
    const newStart = hunkIndex * 84 + 1
    lines.push(`@@ -${oldStart},${contextPerHunk + changesPerHunk} +${newStart},${contextPerHunk + changesPerHunk + 4} @@ export function module${fileIndex}Case${hunkIndex}()`)

    for (let contextIndex = 0; contextIndex < contextPerHunk; contextIndex += 1) {
      lines.push(` const stable${contextIndex} = computeValue(${fileIndex}, ${hunkIndex}, ${contextIndex})`)
    }

    for (let changeIndex = 0; changeIndex < changesPerHunk; changeIndex += 1) {
      const id = `${fileIndex}_${hunkIndex}_${changeIndex}`
      lines.push(`-const item_${id} = { enabled: false, retries: ${changeIndex}, label: "old-${id}" }`)
      lines.push(`+const item_${id} = { enabled: true, retries: ${changeIndex + 1}, label: "new-${id}", source: "fixture" }`)

      if (changeIndex % 3 === 0) {
        lines.push(`+recordChange("module-${fileIndex}", "${id}")`)
      }
    }
  }
}

lines.push("diff --git a/docs/generated-large.md b/docs/generated-large.md")
lines.push("new file mode 100644")
lines.push("index 0000000..abcdef1")
lines.push("--- /dev/null")
lines.push("+++ b/docs/generated-large.md")
lines.push("@@ -0,0 +1,80 @@")
for (let index = 1; index <= 80; index += 1) {
  lines.push(`+generated documentation line ${index}: this exists to test added-file rendering and tab navigation at scale.`)
}

lines.push("diff --git a/assets/large-demo.bin b/assets/large-demo.bin")
lines.push("new file mode 100644")
lines.push("index 0000000..abcdef2")
lines.push("Binary files /dev/null and b/assets/large-demo.bin differ")

await Bun.write("fixtures/huge-sample.diff", `${lines.join("\n")}\n`)

console.log(`wrote fixtures/huge-sample.diff with ${lines.length} lines across ${fileCount + 2} files`)
