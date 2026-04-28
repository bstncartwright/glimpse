import { defineConfig } from "@microsoft/tui-test"

export default defineConfig({
  testMatch: "test/e2e/**/*.tui.ts",
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    rows: 32,
    columns: 120,
    env: {
      ...process.env,
      NO_COLOR: undefined,
    },
  },
  workers: 1,
})
