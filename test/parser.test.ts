import { describe, expect, test } from "bun:test"
import { parseUnifiedDiff } from "../src/parser"

const source = { kind: "stdin" as const, label: "stdin" as const }

describe("parseUnifiedDiff", () => {
  test("parses modified files and aligns replacement rows", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1111111..2222222 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,3 +1,3 @@ function run()",
      " const a = 1",
      "-const b = 2",
      "+const b = 3",
      " return a + b",
      "",
    ].join("\n")

    const parsed = parseUnifiedDiff(diff, source)

    expect(parsed.files).toHaveLength(1)
    expect(parsed.files[0]?.displayPath).toBe("src/app.ts")
    expect(parsed.files[0]?.stats).toEqual({ added: 1, deleted: 1 })
    expect(parsed.files[0]?.hunks[0]?.rows[1]).toMatchObject({
      kind: "modify",
      oldLineNumber: 2,
      newLineNumber: 2,
      oldText: "const b = 2",
      newText: "const b = 3",
    })
  })

  test("does not let inserted lines drift later replacement line numbers", () => {
    const diff = [
      "diff --git a/src/generated.ts b/src/generated.ts",
      "index 1111111..2222222 100644",
      "--- a/src/generated.ts",
      "+++ b/src/generated.ts",
      "@@ -10,4 +10,6 @@",
      " const stable = true",
      "-const first = false",
      "+const first = true",
      "+trackFirst()",
      "-const second = false",
      "+const second = true",
      " return first && second",
      "",
    ].join("\n")

    const parsed = parseUnifiedDiff(diff, source)
    const rows = parsed.files[0]?.hunks[0]?.rows

    expect(rows?.map((row) => [row.kind, row.oldLineNumber, row.newLineNumber])).toEqual([
      ["context", 10, 10],
      ["modify", 11, 11],
      ["add", null, 12],
      ["modify", 12, 13],
      ["context", 13, 14],
    ])
  })

  test("aligns similar lines after inserted additions in one change block", () => {
    const diff = [
      "diff --git a/src/orders.ts b/src/orders.ts",
      "index 1111111..2222222 100644",
      "--- a/src/orders.ts",
      "+++ b/src/orders.ts",
      "@@ -13,3 +13,6 @@",
      "-const subtotal = input.lines.reduce((sum, line) => sum + line.price, 0)",
      "-const discount = input.couponCode ? await loadDiscount(input.couponCode) : 0",
      "-const total = subtotal - discount",
      "+if (input.lines.length === 0) {",
      "+  throw new Error(\"cannot create an order with an empty cart\")",
      "+}",
      "+const subtotal = input.lines.reduce((sum, line) => sum + line.price, 0)",
      "+const discount = input.couponCode ? await loadDiscount(input.couponCode) : 0",
      "+const total = Math.max(0, subtotal - discount)",
      "",
    ].join("\n")

    const parsed = parseUnifiedDiff(diff, source)
    const rows = parsed.files[0]?.hunks[0]?.rows

    expect(rows?.map((row) => [row.kind, row.oldLineNumber, row.newLineNumber])).toEqual([
      ["add", null, 13],
      ["add", null, 14],
      ["add", null, 15],
      ["modify", 13, 16],
      ["modify", 14, 17],
      ["modify", 15, 18],
    ])
  })

  test("parses added files", () => {
    const diff = [
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "index 0000000..1111111",
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1,2 @@",
      "+hello",
      "+world",
      "",
    ].join("\n")

    const parsed = parseUnifiedDiff(diff, source)

    expect(parsed.files[0]?.status).toBe("added")
    expect(parsed.files[0]?.oldPath).toBeNull()
    expect(parsed.files[0]?.newPath).toBe("new.txt")
    expect(parsed.files[0]?.stats.added).toBe(2)
  })

  test("parses deleted files", () => {
    const diff = [
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "index 1111111..0000000",
      "--- a/old.txt",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-gone",
      "-away",
      "",
    ].join("\n")

    const parsed = parseUnifiedDiff(diff, source)

    expect(parsed.files[0]?.status).toBe("deleted")
    expect(parsed.files[0]?.oldPath).toBe("old.txt")
    expect(parsed.files[0]?.newPath).toBeNull()
    expect(parsed.files[0]?.stats.deleted).toBe(2)
  })

  test("parses renamed files", () => {
    const diff = [
      "diff --git a/a.txt b/b.txt",
      "similarity index 88%",
      "rename from a.txt",
      "rename to b.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/b.txt",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
    ].join("\n")

    const parsed = parseUnifiedDiff(diff, source)

    expect(parsed.files[0]?.status).toBe("renamed")
    expect(parsed.files[0]?.displayPath).toBe("a.txt -> b.txt")
  })
})
