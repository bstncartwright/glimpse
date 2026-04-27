# glimpse

full-screen terminal diff review, built with bun and opentui.

glimpse opens a git diff in a keyboard-native terminal ui with file tabs, side-by-side or stacked diff layouts, hunk navigation, word wrap, inline highlights, and syntax coloring for common languages.

## install

glimpse runs on [bun](https://bun.sh/). install bun first, then install the cli from npm:

```bash
bun install -g @bstn/glimpse
```

then run:

```bash
glimpse
```

the npm package is scoped as `@bstn/glimpse`, but the installed command is `glimpse`.

## local development

```bash
bun install
bun run dev
```

## publish

the package is set up for public npm publishing:

```bash
bun pm pack --dry-run
bun publish --access public
```

the package ships the source files directly and uses `#!/usr/bin/env bun` for the command entrypoint. native compiled binaries may come later, but the first public release intentionally stays bun-native so every platform uses the same package.

## sources

```bash
glimpse
glimpse --staged
glimpse main...HEAD
git diff main...HEAD | glimpse --stdin
glimpse --file patch.diff
glimpse --file fixtures/realistic-code-sample.diff
```

## keys

```text
h/l, left/right    scroll diff horizontally
shift+w            toggle word wrap
s                  toggle stacked/side-by-side
tab/shift+tab      next/previous file tab
[/] or p/n         previous/next file tab
{/}                previous/next hunk
w/b                next/previous hunk, then file tab
j/k, up/down       scroll diff
ctrl+d/ctrl+u      scroll diff
space/pageup       page scroll
gg/G               top/bottom
c                  toggle viewed
C                  unmark viewed
?                  help
q                  quit
```

## current limits

- requires bun on the user's `PATH`.
- reads git-backed diffs by shelling out to `git diff`.
- does not persist viewed-file state between runs.
- does not yet support search, config files, or custom keymaps.

## release checklist

- run `bun test`
- run `bun run typecheck`
- run `bun pm pack --dry-run` and inspect the package contents
- publish with `bun publish --access public`

## license

mit
