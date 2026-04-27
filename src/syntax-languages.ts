import { createRequire } from "node:module"
import type { FiletypeParserOptions, TreeSitterClient } from "@opentui/core"

const require = createRequire(import.meta.url)

export const basicSyntaxLanguages: FiletypeParserOptions[] = [
  language("python", "@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm", "tree-sitter-python/queries/highlights.scm", [
    "py",
    "pyi",
  ]),
  language("go", "@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm", "tree-sitter-go/queries/highlights.scm"),
  language("rust", "@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm", "tree-sitter-rust/queries/highlights.scm", [
    "rs",
  ]),
  language("java", "@vscode/tree-sitter-wasm/wasm/tree-sitter-java.wasm", "tree-sitter-java/queries/highlights.scm"),
  language("c", "@lumis-sh/wasm-c/tree-sitter-c.wasm", "tree-sitter-c/queries/highlights.scm", ["h"]),
  language("cpp", "@vscode/tree-sitter-wasm/wasm/tree-sitter-cpp.wasm", "tree-sitter-cpp/queries/highlights.scm", [
    "c++",
    "cc",
    "cxx",
    "hpp",
    "hh",
    "hxx",
  ]),
  language(
    "csharp",
    "@vscode/tree-sitter-wasm/wasm/tree-sitter-c-sharp.wasm",
    "tree-sitter-c-sharp/queries/highlights.scm",
    ["cs", "c_sharp"],
  ),
  language("ruby", "@vscode/tree-sitter-wasm/wasm/tree-sitter-ruby.wasm", "tree-sitter-ruby/queries/highlights.scm", [
    "rb",
  ]),
  language("php", "@vscode/tree-sitter-wasm/wasm/tree-sitter-php.wasm", "tree-sitter-php/queries/highlights.scm"),
  language("html", "@lumis-sh/wasm-html/tree-sitter-html.wasm", "tree-sitter-html/queries/highlights.scm", [
    "htm",
  ]),
  language("css", "@vscode/tree-sitter-wasm/wasm/tree-sitter-css.wasm", "tree-sitter-css/queries/highlights.scm"),
  language("json", "@lumis-sh/wasm-json/tree-sitter-json.wasm", "tree-sitter-json/queries/highlights.scm", [
    "jsonc",
  ]),
  language("yaml", "@lumis-sh/wasm-yaml/tree-sitter-yaml.wasm", "./queries/yaml-highlights.scm", ["yml"]),
  language("toml", "@lumis-sh/wasm-toml/tree-sitter-toml.wasm", "tree-sitter-toml/queries/highlights.scm"),
  language("bash", "@vscode/tree-sitter-wasm/wasm/tree-sitter-bash.wasm", "tree-sitter-bash/queries/highlights.scm", [
    "sh",
    "shell",
    "zsh",
  ]),
  language("sql", "@lumis-sh/wasm-sql/tree-sitter-sql.wasm", "@derekstride/tree-sitter-sql/queries/highlights.scm", [
    "pgsql",
    "psql",
  ]),
]

export function registerBasicSyntaxLanguages(client: TreeSitterClient): void {
  for (const language of basicSyntaxLanguages) {
    client.addFiletypeParser(language)
  }
}

function language(filetype: string, wasm: string, highlights: string, aliases: string[] = []): FiletypeParserOptions {
  return {
    filetype,
    aliases,
    wasm: require.resolve(wasm),
    queries: {
      highlights: [require.resolve(highlights)],
    },
  }
}
