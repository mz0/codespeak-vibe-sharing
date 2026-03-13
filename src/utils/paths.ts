import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CLAUDE_PROJECTS_DIR } from "../config.js";

const execFileAsync = promisify(execFile);

/**
 * Encode a project path the way Claude Code does:
 * replace all path separators with "-".
 * e.g. /Users/foo/proj → -Users-foo-proj
 * e.g. C:\Users\foo\proj → -C-Users-foo-proj (Windows, after normalization)
 */
export function encodeProjectPath(absolutePath: string): string {
  // Normalize to forward slashes, then replace all "/" with "-"
  const normalized = absolutePath.replace(/\\/g, "/");
  return normalized.replace(/\//g, "-");
}

/**
 * Get the Claude Code session directory for a project path.
 */
export function getClaudeSessionDir(projectPath: string): string {
  return path.join(CLAUDE_PROJECTS_DIR, encodeProjectPath(projectPath));
}

/**
 * Get the git repository root for a directory.
 * Returns null if not a git repo or git is not installed.
 */
export async function getGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get current git branch. Returns null if not available.
 */
export async function getGitBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get current git commit hash (short). Returns null if not available.
 */
export async function getGitCommit(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--short", "HEAD"],
      { cwd },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

export interface GitWorktree {
  path: string;
  branch: string | null;
}

/**
 * Get all worktrees for the git repository.
 * Parses `git worktree list --porcelain` output.
 * Falls back to [{ path: cwd, branch: null }] on failure.
 */
export async function getGitWorktrees(cwd: string): Promise<GitWorktree[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd },
    );

    const worktrees: GitWorktree[] = [];
    let currentPath: string | null = null;
    let currentBranch: string | null = null;

    for (const line of stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        // Start of a new worktree block — flush the previous one
        if (currentPath) {
          worktrees.push({ path: currentPath, branch: currentBranch });
        }
        currentPath = line.slice("worktree ".length);
        currentBranch = null;
      } else if (line.startsWith("branch ")) {
        // e.g. "branch refs/heads/main" → "main"
        const ref = line.slice("branch ".length);
        currentBranch = ref.startsWith("refs/heads/")
          ? ref.slice("refs/heads/".length)
          : ref;
      }
    }

    // Flush the last worktree
    if (currentPath) {
      worktrees.push({ path: currentPath, branch: currentBranch });
    }

    return worktrees.length > 0
      ? worktrees
      : [{ path: cwd, branch: null }];
  } catch {
    return [{ path: cwd, branch: null }];
  }
}

/**
 * Get the remote URL for the git repository (origin).
 * Returns null if not a git repo or no remote is configured.
 */
export async function getGitRemoteUrl(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Extract repository name from a git remote URL.
 * Handles HTTPS (https://github.com/user/repo.git) and
 * SSH (git@github.com:user/repo.git) formats.
 */
export function getRepoName(remoteUrl: string): string | null {
  // Take the last path segment, strip .git suffix
  const match = remoteUrl.match(/\/([^/]+?)(?:\.git)?$/) ??
    remoteUrl.match(/:([^/]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

/**
 * Normalize a git remote URL for comparison.
 * Strips protocol, `.git` suffix, trailing slashes, and lowercases host.
 * So `git@github.com:user/repo.git` and `https://github.com/user/repo` compare equal.
 */
export function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim();

  // Strip trailing slashes
  normalized = normalized.replace(/\/+$/, "");

  // Strip .git suffix
  normalized = normalized.replace(/\.git$/, "");

  // SSH format: git@host:user/repo → host/user/repo
  const sshMatch = normalized.match(/^[^@]+@([^:]+):(.+)$/);
  if (sshMatch) {
    normalized = `${sshMatch[1].toLowerCase()}/${sshMatch[2]}`;
  } else {
    // HTTPS/other: strip protocol
    normalized = normalized.replace(/^[a-zA-Z][a-zA-Z+.-]*:\/\//, "");
    // Lowercase host portion (everything before first /)
    const slashIdx = normalized.indexOf("/");
    if (slashIdx > 0) {
      normalized =
        normalized.slice(0, slashIdx).toLowerCase() +
        normalized.slice(slashIdx);
    } else {
      normalized = normalized.toLowerCase();
    }
  }

  return normalized;
}
