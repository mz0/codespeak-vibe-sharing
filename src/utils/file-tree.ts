import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shouldExcludeDefault } from "./excludes.js";

const execFileAsync = promisify(execFile);

export interface FileTreeNode {
  name: string;
  path: string; // relative path from project root
  isDirectory: boolean;
  shared: boolean;
  expanded?: boolean;
  children?: FileTreeNode[];
}

/**
 * Build a file tree for the project, marking files as shared or not shared.
 *
 * Shared = tracked by git + selected untracked files
 * Not Shared = gitignored, excluded dirs
 */
export async function buildFileTree(
  projectRoot: string,
): Promise<FileTreeNode[]> {
  // Get tracked files
  let trackedFiles: Set<string>;
  let gitIgnoredFiles: Set<string>;

  try {
    const { stdout: trackedOut } = await execFileAsync(
      "git",
      ["ls-files"],
      { cwd: projectRoot, maxBuffer: 50 * 1024 * 1024 },
    );
    trackedFiles = new Set(trackedOut.trim().split("\n").filter(Boolean));

    const { stdout: ignoredOut } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--ignored", "--exclude-standard"],
      { cwd: projectRoot, maxBuffer: 50 * 1024 * 1024 },
    );
    gitIgnoredFiles = new Set(ignoredOut.trim().split("\n").filter(Boolean));
  } catch {
    // Not a git repo
    trackedFiles = new Set();
    gitIgnoredFiles = new Set();
  }

  // Also get untracked (not ignored) files — these are "shared" too
  let untrackedFiles: Set<string>;
  try {
    const { stdout: untrackedOut } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd: projectRoot, maxBuffer: 50 * 1024 * 1024 },
    );
    untrackedFiles = new Set(untrackedOut.trim().split("\n").filter(Boolean));
  } catch {
    untrackedFiles = new Set();
  }

  const sharedFiles = new Set([...trackedFiles, ...untrackedFiles]);

  // Walk the directory tree (up to 3 levels deep for initial view)
  return walkDir(projectRoot, "", sharedFiles, 0, 3);
}

async function walkDir(
  root: string,
  relativePath: string,
  sharedFiles: Set<string>,
  depth: number,
  maxDepth: number,
): Promise<FileTreeNode[]> {
  const absPath = relativePath
    ? path.join(root, relativePath)
    : root;

  let entries;
  try {
    entries = await fs.readdir(absPath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    // Skip hidden files at root
    if (entry.name.startsWith(".") && depth === 0) continue;

    const relPath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      // Check if excluded
      const isExcluded = shouldExcludeDefault(relPath, true);

      if (isExcluded) {
        nodes.push({
          name: entry.name,
          path: relPath,
          isDirectory: true,
          shared: false,
          expanded: false,
          children: [],
        });
        continue;
      }

      // Check if any files under this directory are shared
      const hasSharedChildren = [...sharedFiles].some(
        (f) => f.startsWith(relPath + "/"),
      );

      let children: FileTreeNode[] = [];
      if (depth < maxDepth) {
        children = await walkDir(root, relPath, sharedFiles, depth + 1, maxDepth);
      }

      nodes.push({
        name: entry.name,
        path: relPath,
        isDirectory: true,
        shared: hasSharedChildren,
        expanded: depth < 1, // Auto-expand first level
        children,
      });
    } else {
      const isShared = sharedFiles.has(relPath);
      nodes.push({
        name: entry.name,
        path: relPath,
        isDirectory: false,
        shared: isShared,
      });
    }
  }

  return nodes;
}
