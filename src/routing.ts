import type { DiscoveredProject } from "./sessions/types.js";
import type { Screen } from "./ui/app.js";
import { normalizePath } from "./utils/paths.js";
import { getGitRoot, getGitWorktrees } from "./utils/paths.js";

export interface RouteResult {
  screen: Screen;
  projects: DiscoveredProject[];
}

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
 *
 * Step 2.A: cwd is inside a discovered project → share-project screen
 * Step 2.B: cwd is a git repo but no sessions found → manual-entry screen
 * Step 2.C: otherwise → project-list screen
 */
export async function determineRoute(
  cwd: string,
  projects: DiscoveredProject[],
): Promise<Screen> {
  // Step 2.A: Direct match
  const directMatch = findBestProjectMatch(cwd, projects);
  if (directMatch) {
    return { kind: "share-project", projectPath: directMatch.path };
  }

  // Check if cwd is a git repo
  const gitRoot = await getGitRoot(cwd);

  if (gitRoot) {
    // Try matching on git root
    const gitRootMatch = findBestProjectMatch(gitRoot, projects);
    if (gitRootMatch) {
      return { kind: "share-project", projectPath: gitRootMatch.path };
    }

    // Try matching via worktrees — include all worktrees from the same repo
    try {
      const worktrees = await getGitWorktrees(gitRoot);
      for (const wt of worktrees) {
        const wtMatch = findBestProjectMatch(wt.path, projects);
        if (wtMatch) {
          return { kind: "share-project", projectPath: wtMatch.path };
        }
      }
    } catch {
      // Ignore worktree errors
    }

    // Step 2.B: Git repo but no sessions found
    return { kind: "manual-entry", gitRoot };
  }

  // Step 2.C: Not in any project, not a git repo
  return { kind: "project-list" };
}
