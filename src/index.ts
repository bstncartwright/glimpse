#!/usr/bin/env bun

import { HelpRequested, loadDiffSet, parseArgs, usage } from "./diff-source"
import { runApp } from "./app"

try {
  const options = parseArgs(Bun.argv.slice(2))
  const diffSet = await loadDiffSet(options)
  await runApp(diffSet)
} catch (error) {
  if (error instanceof HelpRequested) {
    console.log(usage())
    process.exit(0)
  }

  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
