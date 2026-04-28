import path from "node:path"
import { expect, Key, test } from "@microsoft/tui-test"
import type { Terminal } from "@microsoft/tui-test/lib/terminal/term.js"

const root = process.cwd()
const realisticFixture = path.join(root, "fixtures", "realistic-code-sample.diff")
const largeFixture = path.join(root, "fixtures", "large-varied-sample.diff")

test.describe("glimpse terminal ui", () => {
  test.use({
    program: {
      file: "bun",
      args: ["run", "src/index.ts", "--file", realisticFixture],
    },
  })

  test("renders the review chrome and the first side-by-side diff", async ({ terminal }) => {
    await waitForRealisticApp(terminal)

    await expect(terminal.getByText("glimpse", { strict: false })).toBeVisible()
    await expect(terminal.getByText("0/5 viewed")).toBeVisible()
    await expect(terminal.getByText("1/5 files")).toBeVisible()
    await expect(terminal.getByText("src/orders/create-order.ts", { strict: false })).toBeVisible()
    await expect(terminal.getByText("+43 -22")).toBeVisible()
    await expect(terminal.getByText("createOrder", { strict: false })).toBeVisible()
    await expect(terminal.getByText("s side-by-side", { strict: false })).toBeVisible()

    expect(viewText(terminal)).toContain("wrap:on")
    expect(viewText(terminal)).toContain("inline:word-alt")
    await expect(terminal).toMatchSnapshot()
  })

  test("moves between files and keeps the viewed counter visible", async ({ terminal }) => {
    await waitForRealisticApp(terminal)

    terminal.keyPress("c")
    await expect(terminal.getByText("1/5 viewed")).toBeVisible()
    await expect(terminal.getByText("src/orders/create-order.ts ✓", { strict: false })).toBeVisible()

    terminal.keyPress(Key.Tab)
    await expect(terminal.getByText("2/5 files")).toBeVisible()
    await expect(terminal.getByText("src/orders/order-summary.tsx", { strict: false })).toBeVisible()
    await expect(terminal.getByText("+19 -4")).toBeVisible()

    terminal.keyPress(Key.Tab, { shift: true })
    await expect(terminal.getByText("1/5 files")).toBeVisible()
    await expect(terminal.getByText("src/orders/create-order.ts ✓", { strict: false })).toBeVisible()
  })

  test("opens help, lets q close the modal first, then quits on q", async ({ terminal }) => {
    await waitForRealisticApp(terminal)

    terminal.keyPress("?")
    await expect(terminal.getByText("glimpse help")).toBeVisible()
    await expect(terminal.getByText("w/b                next/previous hunk, then tab")).toBeVisible()

    terminal.keyPress("q")
    await expect(terminal.getByText("glimpse help")).not.toBeVisible()
    await expect(terminal.getByText("src/orders/create-order.ts", { strict: false })).toBeVisible()

    terminal.keyPress("q")
    await waitForExit(terminal)
    expect(terminal.exitResult?.exitCode).toBe(0)
  })

  test("switches layout and wrap modes through the actual keybindings", async ({ terminal }) => {
    await waitForRealisticApp(terminal)

    terminal.keyPress("s")
    await expect(terminal.getByText("diff layout: stacked")).toBeVisible()

    terminal.keyPress("W")
    await expect(terminal.getByText("word wrap: off")).toBeVisible()

    terminal.keyRight(3)
    await expect(terminal.getByText("word wrap: off")).toBeVisible()
  })

  test("supports vim-style top and bottom jumps", async ({ terminal }) => {
    await waitForRealisticApp(terminal)

    terminal.keyPress("G")
    await expect(terminal.getByText("return Math.min", { strict: false })).toBeVisible()

    terminal.keyPress("g")
    terminal.keyPress("g")
    await expect(terminal.getByText("createOrder", { strict: false })).toBeVisible()
  })
})

test.describe("glimpse terminal ui with a multi-hunk fixture", () => {
  test.use({
    program: {
      file: "bun",
      args: ["run", "src/index.ts", "--file", largeFixture],
    },
  })

  test("uses hunk-first w/b traversal before crossing file boundaries", async ({ terminal }) => {
    await waitForLargeApp(terminal)

    await expect(terminal.getByText("@@ -4,20 +4,23", { strict: false })).toBeVisible()

    terminal.keyPress("w")
    await expect(terminal.getByText("@@ -60,20 +64,23", { strict: false })).toBeVisible()
    await expect(terminal.getByText("1/26 files")).toBeVisible()

    terminal.keyPress("w")
    await expect(terminal.getByText("@@ -116,20 +124,23", { strict: false })).toBeVisible()
    await expect(terminal.getByText("1/26 files")).toBeVisible()

    terminal.keyPress("w")
    await expect(terminal.getByText("2/26 files")).toBeVisible()
    await expect(terminal.getByText("billing/invoice-rules.ts", { strict: false })).toBeVisible()

    terminal.keyPress("b")
    await expect(terminal.getByText("1/26 files")).toBeVisible()
    await expect(terminal.getByText("@@ -116,20 +124,23", { strict: false })).toBeVisible()
  })
})

function viewText(terminal: Terminal): string {
  return terminal.serialize().view
}

async function waitForRealisticApp(terminal: Terminal): Promise<void> {
  await expect(terminal.getByText("glimpse", { strict: false })).toBeVisible()
  await expect(terminal.getByText("src/orders/create-order.ts", { strict: false })).toBeVisible()
}

async function waitForLargeApp(terminal: Terminal): Promise<void> {
  await expect(terminal.getByText("glimpse", { strict: false })).toBeVisible()
  await expect(terminal.getByText("auth/session.ts", { strict: false })).toBeVisible()
}

async function waitForExit(terminal: Terminal): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!terminal.exitResult && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
