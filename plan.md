# glimpse plan

## purpose

glimpse is a full-screen terminal diff viewer for engineers who want fast file-to-file navigation, side-by-side review, and deep configurability without leaving the terminal.

the core problem is that most diff clis optimize for streaming output. that is useful for quick checks, but awkward for real review work where the engineer wants to jump between changed files, scan hunks, compare before/after, search, and tune the display to their workflow.

glimpse should feel closer to a focused code review surface than a pager.

## product principles

- file navigation is a first-class workflow, not an afterthought.
- the current file should be visually stable: side-by-side panes, clear hunk boundaries, synchronized scrolling, and predictable line alignment.
- configuration should cover the things engineers actually personalize: keybindings, theme, context lines, whitespace handling, tab behavior, and diff sources.
- defaults should be good enough that `glimpse` with no flags is immediately useful in a git repo.
- large diffs should remain responsive through parsing, indexing, and viewport-based rendering.
- every interaction should be keyboard-native, with mouse support treated as useful but secondary.

## target users

- engineers reviewing their own work before committing.
- engineers moving through a pull request patch locally.
- maintainers checking staged vs unstaged changes.
- cli-heavy users who want the navigation density of an editor without launching one.

## runtime and stack

- runtime: bun.
- language: typescript.
- tui: opentui via `@opentui/core`.
- package manager: bun.
- initial render model: opentui core components, not react/solid, unless the app state becomes complex enough to justify a binding later.
- diff input: shell out to `git diff` for git-backed sources in the first version, then parse unified diff output into an internal model.

opentui is bun-first, uses a flexbox-style layout system, and exposes structured keyboard events. that fits the expected app shape: a full-screen root layout, top file tabs, side-by-side diff panes, and global keybindings.

## main workflows

### default repo review

`glimpse`

opens a full-screen tui for unstaged changes in the current git repository.

### staged review

`glimpse --staged`

shows staged changes.

### commit or range review

`glimpse main...HEAD`

shows a range diff.

### patch review

`glimpse --file patch.diff`

loads a saved unified diff.

### stdin review

`git diff main...HEAD | glimpse --stdin`

loads diff content from stdin.

## screen layout

### top tab bar

the top row contains one tab per changed file.

requirements:

- active file is visually distinct.
- tabs show enough path context to distinguish files with the same basename.
- tabs can horizontally scroll when there are more files than fit.
- dirty/change metadata should be compact: added, modified, deleted, renamed, binary, conflict.
- keyboard navigation between files should update the active tab and active diff pane immediately.

future options:

- pin current file.
- filter tabs by path or status.
- alternate file list sidebar mode for very large changesets.

### diff body

the main region is a side-by-side diff for the active file.

requirements:

- left pane is old content, right pane is new content.
- panes scroll together by default.
- each side shows line numbers.
- inserted, deleted, and modified lines use distinct colors.
- unchanged context is dimmer than changed lines.
- hunk headers are visually separated.
- missing lines on one side render as empty aligned rows, not collapsed text.
- long lines can be handled by configurable wrap or horizontal scroll.
- binary files, deleted files, added files, and renames have explicit states.

future options:

- inline mode toggle.
- word-level highlights within changed lines.
- syntax highlighting by file extension.
- collapse unchanged sections between hunks.

### bottom status bar

the bottom row gives immediate operational context.

requirements:

- current file index and total file count.
- current hunk index and total hunk count.
- current source, such as `unstaged`, `staged`, `main...HEAD`, `stdin`, or file path.
- active mode, such as normal, search, command, or help.
- short key hints for the most important actions.

## navigation requirements

### file navigation

- next file.
- previous file.
- jump to first file.
- jump to last file.
- fuzzy open file by path.
- jump by status, such as next deleted file or next renamed file.

### hunk navigation

- next hunk in current file.
- previous hunk in current file.
- next changed line.
- previous changed line.
- center current hunk in viewport.

### viewport navigation

- scroll up/down by line.
- scroll up/down by page.
- horizontal scroll left/right when wrapping is disabled.
- jump to top/bottom of current file.
- keep left and right panes synchronized by default.
- allow temporary unsynced scroll for inspecting misaligned regions.

### search

- search current file diff text.
- search all changed files.
- next/previous match.
- optionally restrict search to paths, added lines, deleted lines, or context.

## proposed default keybindings

these should be configurable, but the defaults should match common terminal review habits.

| action | key |
| --- | --- |
| quit | `q`, `ctrl+c` |
| help | `?` |
| next file | `l`, `]`, `tab` |
| previous file | `h`, `[`, `shift+tab` |
| next hunk | `j` |
| previous hunk | `k` |
| scroll down | `down`, `ctrl+d` |
| scroll up | `up`, `ctrl+u` |
| page down | `pagedown`, `space` |
| page up | `pageup`, `b` |
| top of file | `g` |
| bottom of file | `G` |
| open file picker | `p` |
| search | `/` |
| next search result | `n` |
| previous search result | `N` |
| toggle wrap | `w` |
| toggle inline/side-by-side | `s` |
| refresh diff | `r` |

## configuration requirements

glimpse should support a project-local config and a user config.

load order:

1. built-in defaults.
2. user config: `~/.config/glimpse/config.json`.
3. project config: `.glimpserc.json`.
4. cli flags.

first-pass config shape:

```json
{
  "theme": "default",
  "contextLines": 3,
  "tabWidth": 2,
  "wrap": false,
  "showWhitespace": false,
  "ignoreWhitespace": false,
  "syntaxHighlighting": false,
  "fileTabMode": "tabs",
  "keybindings": {
    "nextFile": ["l", "]", "tab"],
    "previousFile": ["h", "[", "shift+tab"],
    "nextHunk": ["j"],
    "previousHunk": ["k"]
  }
}
```

future config:

- custom color themes.
- path-based rules, such as always wrap markdown.
- file status filters.
- external editor integration.
- preferred git diff arguments.

## cli requirements

initial command shape:

```bash
glimpse [range]
glimpse --staged
glimpse --stdin
glimpse --file patch.diff
glimpse --context 5
glimpse --ignore-whitespace
glimpse --name-only
```

behavior:

- when no args are provided, run `git diff --no-ext-diff`.
- when `--staged` is provided, run `git diff --cached --no-ext-diff`.
- when a range is provided, pass it to `git diff --no-ext-diff <range>`.
- when stdin or file input is used, do not require a git repository.
- show a useful empty state when there are no changes.
- fail clearly when git is unavailable or the current directory is not a git repo.

## internal data model

the parser should convert unified diff text into a stable model before rendering.

```ts
type DiffSet = {
  source: DiffSource
  files: DiffFile[]
}

type DiffFile = {
  oldPath: string | null
  newPath: string | null
  displayPath: string
  status: "added" | "modified" | "deleted" | "renamed" | "binary"
  hunks: DiffHunk[]
  stats: FileStats
}

type DiffHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  rows: DiffRow[]
}

type DiffRow = {
  kind: "context" | "add" | "delete" | "modify" | "empty"
  oldLineNumber: number | null
  newLineNumber: number | null
  oldText: string | null
  newText: string | null
}
```

the renderer should consume this model rather than raw diff text. that keeps navigation, search, alignment, and future export/test behavior deterministic.

## rendering plan

opentui layout:

- root column fills terminal.
- tab bar fixed height at top.
- diff body flexes to fill remaining space.
- side-by-side panes are row children with equal width.
- status bar fixed height at bottom.
- overlays for help, picker, and search use absolute positioning.

rendering requirements:

- derive visible rows from current file, scroll offset, viewport height, and wrapping mode.
- avoid rendering every row of large files.
- recompute layout on terminal resize.
- preserve active file and scroll position across refresh when possible.
- keep renderer state separate from diff model and app state.

## state model

```ts
type AppState = {
  diffSet: DiffSet
  activeFileIndex: number
  activeHunkIndex: number
  scrollYByFile: Record<string, number>
  scrollXByFile: Record<string, number>
  mode: "normal" | "search" | "picker" | "help"
  searchQuery: string
  searchResults: SearchResult[]
  config: ResolvedConfig
}
```

## first-pass mvp

the first useful version should include:

- bun package setup.
- `glimpse` executable entrypoint.
- git unstaged, staged, range, stdin, and file diff sources.
- unified diff parser for normal text diffs.
- full-screen opentui app with tabs, side-by-side panes, and status bar.
- keyboard navigation for files, hunks, scrolling, quit, help, and refresh.
- basic config loading from user/project json.
- empty, error, binary, added, deleted, and renamed file states.
- focused tests for parser behavior and key state transitions.

explicitly out of scope for the first pass:

- word-level intra-line highlighting.
- syntax highlighting.
- mouse support.
- applying or staging hunks.
- editing files.
- github api or pull request comments.
- three-way merge conflict resolution.

## power-user features after mvp

- command palette for actions.
- fuzzy file picker.
- alternate sidebar mode for large changesets.
- git worktree awareness.
- compare arbitrary files or directories.
- open current file in `$editor` at the selected line.
- copy selected hunk or path.
- stage/unstage file or hunk after a deliberate safety design.
- persistent review state per repository.
- custom themes.
- plugin hooks for custom diff sources.
- semantic diff mode for supported languages.

## test strategy

parser tests:

- added file.
- deleted file.
- modified file.
- renamed file.
- binary file.
- file paths with spaces.
- multiple hunks.
- no newline at end of file.
- combined additions and deletions that should align as modifications.

state tests:

- next/previous file wraps or clamps according to config.
- hunk navigation updates scroll.
- refresh preserves active file by path.
- search result navigation crosses file boundaries.
- config overrides merge correctly.

manual tui checks:

- `bun run dev` opens the app in a repo with changes.
- resizing the terminal does not corrupt layout.
- tabs remain usable with many changed files.
- large diffs remain responsive.
- `q` and `ctrl+c` exit cleanly.

## acceptance criteria

- running `glimpse` in a git repo with changes opens a full-screen tui.
- the top of the tui shows navigable file tabs.
- selecting a tab shows only that file's diff.
- side-by-side panes align old and new lines for the active file.
- users can move between files without scrolling through unrelated diffs.
- users can move between hunks within a file.
- the app has clear empty and error states.
- configuration can change at least keybindings, context lines, wrapping, and whitespace behavior.
- the app remains responsive on a diff with at least 100 changed files and 10,000 changed lines.

## proposed implementation order

1. initialize bun/typescript package and install opentui.
2. add cli argument parsing and diff source collection.
3. build the unified diff parser and parser tests.
4. define app state, config loading, and keybinding resolution.
5. create the opentui shell: root layout, tab bar, body panes, status bar.
6. render side-by-side rows for one active file.
7. add file, hunk, and viewport navigation.
8. add help overlay, empty states, and error states.
9. add refresh behavior.
10. harden against large diffs with viewport rendering and parser fixtures.
