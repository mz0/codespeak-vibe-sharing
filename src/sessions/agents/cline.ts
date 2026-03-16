import path from "node:path";
import { CLINE_DIR, CLINE_TASKS_DIR, CLINE_HISTORY_FILE } from "../../config.js";
import {
  directoryExists,
  safeReadJson,
  getFileSize,
  walkDirectoryAbsolute,
} from "../../utils/fs-helpers.js";
import { getGitRoot, getGitRemoteUrl, normalizeRemoteUrl } from "../../utils/paths.js";
import type { AgentProvider, DiscoveredSession, ProjectContext } from "../types.js";

interface ClineTaskHistoryEntry {
  id: string;
  task?: string;
  tokensIn?: number;
  tokensOut?: number;
  cwdOnTaskInitialization?: string;
  modelId?: string;
}

export class ClineProvider implements AgentProvider {
  readonly name = "Cline";
  readonly slug = "cline";

  /** Matched task IDs (populated during findSessions) */
  private matchedTaskIds = new Set<string>();

  /** Matched history entries for virtual files */
  private matchedHistoryEntries: ClineTaskHistoryEntry[] = [];

  /** Cache: cwd → normalized remote URL (or null) to avoid redundant git calls */
  private cwdRemoteCache = new Map<string, string | null>();

  async detect(): Promise<boolean> {
    return directoryExists(CLINE_DIR);
  }

  getArchiveRoot(): string {
    return CLINE_DIR;
  }

  async discoverProjects(): Promise<Map<string, number>> {
    const projects = new Map<string, number>();

    try {
      const history = await safeReadJson<ClineTaskHistoryEntry[]>(
        CLINE_HISTORY_FILE,
      );
      if (!history || !Array.isArray(history)) return projects;

      for (const entry of history) {
        if (!entry.cwdOnTaskInitialization) continue;
        const cwd = entry.cwdOnTaskInitialization;
        projects.set(cwd, (projects.get(cwd) ?? 0) + 1);
      }
    } catch {
      // Never throw
    }

    return projects;
  }

  async findSessions(context: ProjectContext): Promise<DiscoveredSession[]> {
    const history = await safeReadJson<ClineTaskHistoryEntry[]>(
      CLINE_HISTORY_FILE,
    );
    if (!history || !Array.isArray(history)) return [];

    const sessions: DiscoveredSession[] = [];

    for (const entry of history) {
      if (!entry.cwdOnTaskInitialization) continue;

      const matched = await this.taskMatchesProject(
        entry.cwdOnTaskInitialization,
        context,
      );
      if (!matched) continue;

      const taskDir = path.join(CLINE_TASKS_DIR, entry.id);
      if (!(await directoryExists(taskDir))) continue;

      const files = await walkDirectoryAbsolute(taskDir);

      let totalSize = 0;
      for (const f of files) {
        totalSize += await getFileSize(f);
      }

      this.matchedTaskIds.add(entry.id);
      this.matchedHistoryEntries.push(entry);

      sessions.push({
        agentName: this.name,
        sessionId: entry.id,
        summary: entry.task ?? null,
        firstPrompt: entry.task ?? null,
        messageCount: null,
        created: null,
        modified: null,
        sizeBytes: totalSize,
      });
    }

    return sessions;
  }

  async getSessionFiles(_session: DiscoveredSession): Promise<string[]> {
    // All files go through getProviderFiles()
    return [];
  }

  async getProviderFiles(): Promise<string[]> {
    if (this.matchedTaskIds.size === 0) return [];

    const allFiles: string[] = [];
    for (const taskId of this.matchedTaskIds) {
      const taskDir = path.join(CLINE_TASKS_DIR, taskId);
      if (await directoryExists(taskDir)) {
        const files = await walkDirectoryAbsolute(taskDir);
        allFiles.push(...files);
      }
    }
    return allFiles;
  }

  async getVirtualFiles(): Promise<Array<{ relativePath: string; content: string }>> {
    if (this.matchedHistoryEntries.length === 0) return [];

    return [{
      relativePath: "data/state/taskHistory.json",
      content: JSON.stringify(this.matchedHistoryEntries, null, 2),
    }];
  }

  /**
   * Check if a task's cwd matches the project.
   * 1. Path prefix check (fast)
   * 2. Git remote URL fallback (if path check fails and gitRemoteUrl is set)
   */
  private async taskMatchesProject(
    cwd: string,
    context: ProjectContext,
  ): Promise<boolean> {
    // Fast path: check against all worktree paths
    for (const worktreePath of context.allWorktreePaths) {
      if (this.cwdMatchesPath(cwd, worktreePath)) return true;
    }

    // Git fallback: compare remote URLs
    if (!context.gitRemoteUrl) return false;

    const cwdRemote = await this.getCwdRemoteUrl(cwd);
    if (!cwdRemote) return false;

    return (
      normalizeRemoteUrl(cwdRemote) ===
      normalizeRemoteUrl(context.gitRemoteUrl)
    );
  }

  /**
   * Get the normalized remote URL for a cwd, with caching.
   * Returns null if the directory doesn't exist, isn't a git repo, or has no remote.
   */
  private async getCwdRemoteUrl(cwd: string): Promise<string | null> {
    if (this.cwdRemoteCache.has(cwd)) {
      return this.cwdRemoteCache.get(cwd)!;
    }

    let result: string | null = null;
    if (await directoryExists(cwd)) {
      const gitRoot = await getGitRoot(cwd);
      if (gitRoot) {
        result = await getGitRemoteUrl(gitRoot);
      }
    }

    this.cwdRemoteCache.set(cwd, result);
    return result;
  }

  private cwdMatchesPath(cwd: string, projectPath: string): boolean {
    const normalized = cwd.replace(/\\/g, "/");
    const normalizedProject = projectPath.replace(/\\/g, "/");
    return (
      normalized === normalizedProject ||
      normalized.startsWith(normalizedProject + "/")
    );
  }
}
