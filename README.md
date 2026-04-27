# glimpse

full-screen terminal diff review, built with bun and opentui.

glimpse opens a git diff in a keyboard-native terminal ui with file tabs, side-by-side or stacked diff layouts, hunk navigation, word wrap, inline highlights, and syntax coloring for common languages.

## why

this project started as a tool i built to help myself review agents' work better in a place where i already am: the terminal.

## install

glimpse runs on [bun](https://bun.sh/). install bun first, then install the cli from npm:

```bash
bun install -g @bstncartwright/glimpse
```

then run:

```bash
glimpse
```

the npm package is scoped as `@bstncartwright/glimpse`, but the installed command is `glimpse`.

## local development

```bash
bun install
bun run dev
```

## publish (github release -> npm)

a github actions workflow now publishes to npm whenever a github release is marked **published**.

### one-time setup (npm trusted publishing / OIDC)

1. on npm, open your package settings and configure a **Trusted Publisher** for GitHub Actions.
2. use your github owner/repo and set workflow filename to `.github/workflows/release-publish.yml`.
3. make sure `package.json` has the correct `name` and a `repository.url` that matches your github repo.
4. publish once and verify provenance appears on npm (trusted publishing enables this automatically for public repos/packages).

> with trusted publishing, you do **not** need an `NPM_TOKEN` repository secret.

### release process (manual)

1. bump `version` in `package.json` (for example `0.1.0` -> `0.1.1`).
2. run local checks:

```bash
bun run typecheck
bun test
bun pm pack --dry-run
```

3. commit and push.
4. create a git tag that matches the package version with a `v` prefix (example: `v0.1.1`).
5. create/publish a github release from that tag.
6. the `Publish to npm` workflow runs and publishes with `npm publish --access public` using OIDC.

> the publish workflow validates that the release tag matches `package.json` (for example, release `v0.1.1` must match `"version": "0.1.1"`). this avoids publishing the wrong version.

### one-click release (workflow dispatch)

if you want a single click release, run the **Prepare and release** workflow from the actions tab.

it will:

1. check out `main`
2. bump `package.json` version (patch/minor/major, or use an explicit version input)
3. commit + push that change to `main`
4. create and push `v<version>` tag
5. create and publish a github release for that tag
6. trigger `Publish to npm` automatically via the release event

notes:
- this workflow needs `contents: write` permission (already configured).
- publishing happens in `release-publish.yml` using npm trusted publishing (OIDC), not a long-lived token.
- if a tag already exists, it fails safely before changing anything else.

the package ships source files directly and uses `#!/usr/bin/env bun` for the command entrypoint. native compiled binaries may come later, but the first public release intentionally stays bun-native so every platform uses the same package.

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

- either run **Prepare and release** (one click), or manually do the steps below
- bump `version` in `package.json`
- run `bun test`
- run `bun run typecheck`
- run `bun pm pack --dry-run` and inspect package contents
- create tag `v<package.json version>`
- publish a github release from that tag (workflow publishes to npm)

## license

mit
