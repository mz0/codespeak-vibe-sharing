import type { DiscoveredProject } from "./sessions/types.js";
import type { Screen } from "./ui/app.js";
import { normalizePath } from "./utils/paths.js";
import { getGitRoot, getGitWorktrees } from "./utils/paths.js";

/**
 * Find the best matching project for a directory.
 * Returns the project with the longest matching path prefix (most specific).
 */
function findBestProjectMatch(
  cwd: string,
  projects: DiscoveredProject[],
): DiscoveredProject | null {
  const normalizedCwd = normalizePath(cwd);
  let bestMatch: DiscoveredProject | null = null;
  let bestLength = 0;

  for (const project of projects) {
    const normalizedProject = normalizePath(project.path);

    if (
      normalizedCwd === normalizedProject ||
      normalizedCwd.startsWith(normalizedProject + "/")
    ) {
      if (normalizedProject.length > bestLength) {
        bestLength = normalizedProject.length;
        bestMatch = project;
      }
    }
  }

  return bestMatch;
}

/**
 * Determine the initial route based on cwd and discovered projects.
 * Always opens the project list, but pre-selects the current project if found.
 */
export async function determineRoute(
  cwd: string,
  projects: DiscoveredProject[],
): Promise<Screen> {
  // Try to find the current project by matching cwd
  const directMatch = findBestProjectMatch(cwd, projects);
  if (directMatch) {
    return { kind: "project-list", currentProjectPath: directMatch.path };
  }

  // Check if cwd is a git repo and try matching via git root / worktrees
  const gitRoot = await getGitRoot(cwd);
  if (gitRoot) {
    const gitRootMatch = findBestProjectMatch(gitRoot, projects);
    if (gitRootMatch) {
      return { kind: "project-list", currentProjectPath: gitRootMatch.path };
    }

    try {
      const worktrees = await getGitWorktrees(gitRoot);
      for (const wt of worktrees) {
        const wtMatch = findBestProjectMatch(wt.path, projects);
        if (wtMatch) {
          return { kind: "project-list", currentProjectPath: wtMatch.path };
        }
      }
    } catch {
      // Ignore worktree errors
    }
  }

  return { kind: "project-list" };
}
