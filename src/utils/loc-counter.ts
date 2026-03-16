import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const execFileAsync = promisify(execFile);

export interface LanguageStats {
  fileCount: number;
  lineCount: number;
}

// Extension → Language mapping (~40 common extensions)
const EXT_TO_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".h": "C/C++",
  ".cpp": "C++",
  ".cc": "C++",
  ".cxx": "C++",
  ".hpp": "C++",
  ".cs": "C#",
  ".css": "CSS",
  ".scss": "SCSS",
  ".less": "Less",
  ".html": "HTML",
  ".htm": "HTML",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown",
  ".sql": "SQL",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".fish": "Shell",
  ".php": "PHP",
  ".dart": "Dart",
  ".lua": "Lua",
  ".r": "R",
  ".R": "R",
  ".scala": "Scala",
  ".zig": "Zig",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".ml": "OCaml",
  ".fs": "F#",
  ".fsx": "F#",
  ".clj": "Clojure",
  ".cljs": "Clojure",
  ".tf": "Terraform",
  ".proto": "Protobuf",
  ".xml": "XML",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
};

// Directories to exclude even from tracked files
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  ".git",
  ".next",
  ".nuxt",
  "coverage",
  "target",
  "vendor",
  ".gradle",
  "Pods",
  ".dart_tool",
]);

/**
 * Check if a CLI tool is available.
 */
async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to count LOC using tokei.
 */
async function tryTokei(
  cwd: string,
): Promise<Map<string, LanguageStats> | null> {
  if (!(await hasCommand("tokei"))) return null;

  try {
    const { stdout } = await execFileAsync(
      "tokei",
      ["--output", "json"],
      { cwd, maxBuffer: 50 * 1024 * 1024 },
    );

    const data = JSON.parse(stdout) as Record<
      string,
      { code: number; reports: unknown[] } | undefined
    >;

    const result = new Map<string, LanguageStats>();
    for (const [lang, info] of Object.entries(data)) {
      if (!info || lang === "Total") continue;
      const fileCount = Array.isArray(info.reports) ? info.reports.length : 0;
      if (info.code > 0) {
        result.set(lang, { fileCount, lineCount: info.code });
      }
    }

    return result.size > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Try to count LOC using cloc.
 */
async function tryCloc(
  cwd: string,
): Promise<Map<string, LanguageStats> | null> {
  if (!(await hasCommand("cloc"))) return null;

  try {
    const { stdout } = await execFileAsync(
      "cloc",
      ["--json", "--quiet", "."],
      { cwd, maxBuffer: 50 * 1024 * 1024, timeout: 60000 },
    );

    const data = JSON.parse(stdout) as Record<
      string,
      { nFiles: number; code: number } | undefined
    >;

    const result = new Map<string, LanguageStats>();
    for (const [lang, info] of Object.entries(data)) {
      if (!info || lang === "header" || lang === "SUM") continue;
      if (info.code > 0) {
        result.set(lang, { fileCount: info.nFiles, lineCount: info.code });
      }
    }

    return result.size > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Count lines in a file by streaming.
 */
async function countLines(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    let count = 0;
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });
    rl.on("line", () => count++);
    rl.on("close", () => resolve(count));
    rl.on("error", () => resolve(0));
  });
}

/**
 * Fallback: count LOC using git ls-files + extension mapping.
 */
async function fallbackCount(
  cwd: string,
): Promise<Map<string, LanguageStats>> {
  const result = new Map<string, LanguageStats>();

  // Get tracked files from git, or walk directory
  let files: string[];
  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
    });
    files = stdout.trim().split("\n").filter(Boolean);
  } catch {
    // Not a git repo — skip for now (could walk directory)
    return result;
  }

  // Filter out excluded directories
  files = files.filter((f) => {
    const parts = f.split("/");
    return !parts.some((p) => EXCLUDED_DIRS.has(p));
  });

  // Group by language and count
  const byLang = new Map<string, string[]>();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const lang = EXT_TO_LANG[ext];
    if (!lang) continue;

    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang)!.push(file);
  }

  // Count lines in parallel (batch of 50)
  for (const [lang, langFiles] of byLang) {
    let totalLines = 0;
    const batchSize = 50;

    for (let i = 0; i < langFiles.length; i += batchSize) {
      const batch = langFiles.slice(i, i + batchSize);
      const counts = await Promise.all(
        batch.map((f) => countLines(path.join(cwd, f))),
      );
      totalLines += counts.reduce((a, b) => a + b, 0);
    }

    result.set(lang, { fileCount: langFiles.length, lineCount: totalLines });
  }

  return result;
}

/**
 * Count LOC by programming language.
 * Tries tokei first, then cloc, then falls back to manual counting.
 */
export async function countLoc(
  cwd: string,
): Promise<Map<string, LanguageStats>> {
  // Try external tools first
  const tokeiResult = await tryTokei(cwd);
  if (tokeiResult) return tokeiResult;

  const clocResult = await tryCloc(cwd);
  if (clocResult) return clocResult;

  // Fallback to manual counting
  return fallbackCount(cwd);
}
