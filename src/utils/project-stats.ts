import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { countLoc, type LanguageStats } from "./loc-counter.js";
import { getGitRoot } from "./paths.js";

const execFileAsync = promisify(execFile);

export interface ProjectStats {
  isGitRepo: boolean;
  languages: Array<{
    name: string;
    files: number;
    loc: number;
    percent: number;
  }>;
  totalFiles: number;
  totalLoc: number;
  branchCount: number;
  commitCount: number;
  activitySummary: string | null;
  untrackedCount: number;
  uncommittedCount: number;
}

async function gitOutput(
  args: string[],
  cwd: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}

function formatActivitySpan(dates: string[]): string | null {
  if (dates.length === 0) return null;

  const uniqueDates = [...new Set(dates)].sort();
  const dayCount = uniqueDates.length;

  if (uniqueDates.length < 2) return `${dayCount} day of activity`;

  const first = new Date(uniqueDates[0]!);
  const last = new Date(uniqueDates[uniqueDates.length - 1]!);
  const spanMs = last.getTime() - first.getTime();
  const spanDays = Math.ceil(spanMs / (1000 * 60 * 60 * 24));

  let spanLabel: string;
  if (spanDays < 7) {
    spanLabel = `${spanDays} day${spanDays !== 1 ? "s" : ""}`;
  } else if (spanDays < 60) {
    const weeks = Math.ceil(spanDays / 7);
    spanLabel = `${weeks} week${weeks !== 1 ? "s" : ""}`;
  } else {
    const months = Math.ceil(spanDays / 30);
    spanLabel = `${months} month${months !== 1 ? "s" : ""}`;
  }

  return `${dayCount} days of activity over ${spanLabel}`;
}

export async function getProjectStats(
  projectPath: string,
): Promise<ProjectStats> {
  const gitRoot = await getGitRoot(projectPath);
  const isGitRepo = !!gitRoot;
  const root = gitRoot ?? projectPath;

  // Run git stats and LOC counting in parallel
  const [
    locStats,
    branchOutput,
    commitOutput,
    activityOutput,
    untrackedOutput,
    statusOutput,
  ] = await Promise.all([
    countLoc(root),
    isGitRepo ? gitOutput(["branch", "-a", "--format=%(refname:short)"], root) : Promise.resolve(""),
    isGitRepo ? gitOutput(["rev-list", "--all", "--count"], root) : Promise.resolve("0"),
    isGitRepo ? gitOutput(["log", "--all", "--format=%as"], root) : Promise.resolve(""),
    isGitRepo ? gitOutput(["ls-files", "--others", "--exclude-standard"], root) : Promise.resolve(""),
    isGitRepo ? gitOutput(["status", "--porcelain"], root) : Promise.resolve(""),
  ]);

  // Process LOC stats
  const totalLoc = [...locStats.values()].reduce((sum, l) => sum + l.lineCount, 0);
  const languages = [...locStats.entries()]
    .map(([name, stats]) => ({
      name,
      files: stats.fileCount,
      loc: stats.lineCount,
      percent: totalLoc > 0 ? (stats.lineCount / totalLoc) * 100 : 0,
    }))
    .sort((a, b) => b.loc - a.loc);

  const totalFiles = [...locStats.values()].reduce((sum, l) => sum + l.fileCount, 0);

  // Git stats
  const branchCount = branchOutput
    .trim()
    .split("\n")
    .filter(Boolean).length;

  const commitCount = parseInt(commitOutput.trim(), 10) || 0;

  const activityDates = activityOutput
    .trim()
    .split("\n")
    .filter(Boolean);
  const activitySummary = formatActivitySpan(activityDates);

  const untrackedCount = untrackedOutput
    .trim()
    .split("\n")
    .filter(Boolean).length;

  // Count uncommitted changes (modified/added/deleted tracked files)
  const uncommittedCount = statusOutput
    .trim()
    .split("\n")
    .filter((line) => {
      if (!line) return false;
      // Status porcelain: first two chars are status codes
      // ? = untracked (skip), anything else = tracked change
      return !line.startsWith("?");
    }).length;

  return {
    isGitRepo,
    languages,
    totalFiles,
    totalLoc,
    branchCount,
    commitCount,
    activitySummary,
    untrackedCount,
    uncommittedCount,
  };
}
