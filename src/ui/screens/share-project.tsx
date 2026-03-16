import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import os from "node:os";
import type { DiscoveredProject } from "../../sessions/types.js";
import { Header } from "../components/header.js";
import { KeyHint } from "../components/key-hint.js";
import { getGitRemoteUrl } from "../../utils/paths.js";
import { getProjectStats, type ProjectStats } from "../../utils/project-stats.js";
import { getFirstName } from "../../utils/user-info.js";

interface ShareProjectScreenProps {
  projectPath: string;
  projects: DiscoveredProject[];
  showHeader?: boolean;
  onShare: () => void;
  onReview: () => void;
  onBack: () => void;
}

function shortenPath(p: string): string {
  const home = os.homedir();
  if (p === home) return "~";
  if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
  return p;
}

export function ShareProjectScreen({
  projectPath,
  projects,
  showHeader = false,
  onShare,
  onReview,
  onBack,
}: ShareProjectScreenProps) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState<string | null>(null);
  const { stdout } = useStdout();
  const width = Math.min(60, (stdout.columns ?? 80) - 4);

  const project = projects.find((p) => p.path === projectPath);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getProjectStats(projectPath),
      getGitRemoteUrl(projectPath).catch(() => null),
      showHeader ? getFirstName() : Promise.resolve(null),
    ]).then(([s, url, name]) => {
      if (cancelled) return;
      setStats(s);
      setRepoUrl(url);
      setFirstName(name);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectPath, showHeader]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    } else if (input === "s" || input === "S") {
      onShare();
    } else if (input === "r" || input === "R") {
      onReview();
    }
  });

  const separator = "─".repeat(width);

  return (
    <Box flexDirection="column">
      {showHeader && <Header firstName={firstName} />}
      <Text bold color="cyan">
        {shortenPath(projectPath)}
      </Text>
      {repoUrl && <Text dimColor>{repoUrl}</Text>}
      <Text dimColor>{separator}</Text>

      {/* Agent sessions */}
      {project && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">Agents</Text>
          {project.agents.map((agent) => {
            const slug = Object.keys(project.sessionCounts).find((s) =>
              agent.toLowerCase().replace(/\s+/g, "-").includes(s) ||
              s.includes(agent.toLowerCase().replace(/\s+/g, "-")),
            );
            const count = slug ? project.sessionCounts[slug] : 0;
            return (
              <Text key={agent}>
                {"  "}
                {agent.padEnd(16)}
                <Text color="cyan" bold>{count}</Text>
                {" "}session{count !== 1 ? "s" : ""}
              </Text>
            );
          })}
        </Box>
      )}

      {/* Code stats */}
      {loading && (
        <Box marginTop={1}>
          <Text dimColor>Loading project stats...</Text>
        </Box>
      )}
      {stats && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">Code</Text>
          {stats.languages.map((lang) => (
            <Text key={lang.name}>
              {"  "}
              {lang.name.padEnd(16)}
              {String(lang.files).padStart(5)} files
              {"  "}
              {lang.loc.toLocaleString().padStart(8)} LOC
              {"  "}
              <Text dimColor>{lang.percent.toFixed(1).padStart(5)}%</Text>
            </Text>
          ))}
          {stats.languages.length > 0 && (
            <Text dimColor>
              {"  "}
              {"Total".padEnd(16)}
              {String(stats.totalFiles).padStart(5)} files
              {"  "}
              {stats.totalLoc.toLocaleString().padStart(8)} LOC
            </Text>
          )}
        </Box>
      )}

      {/* Git stats */}
      {stats && stats.isGitRepo && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">Git</Text>
          <Text>  Branches: <Text color="cyan" bold>{stats.branchCount}</Text></Text>
          <Text>
            {"  "}Commits: <Text color="cyan" bold>{stats.commitCount}</Text> (across all branches)
          </Text>
          {stats.activitySummary && (
            <Text>  Activity: {stats.activitySummary}</Text>
          )}
          <Text>  Untracked: {stats.untrackedCount} files</Text>
          <Text>  Uncommitted: {stats.uncommittedCount} files</Text>
        </Box>
      )}

      <KeyHint
        hints={[
          { key: "S", label: "share", primary: true },
          { key: "R", label: "review before sharing" },
          { key: "Esc", label: "back" },
        ]}
      />
    </Box>
  );
}
