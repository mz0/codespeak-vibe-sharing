import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import os from "node:os";
import type { DiscoveredProject } from "../../sessions/types.js";
import { Header } from "../components/header.js";
import { KeyHint } from "../components/key-hint.js";
import { ScrollableList, type ListItem } from "../components/scrollable-list.js";
import { getFirstName } from "../../utils/user-info.js";

interface ProjectListScreenProps {
  projects: DiscoveredProject[];
  sharedPaths: Set<string>;
  onSelect: (path: string) => void;
  onShare: (path: string) => void;
  onQuit: () => void;
}

function shortenPath(p: string): string {
  const home = os.homedir();
  if (p === home) return "~";
  if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
  return p;
}

export function ProjectListScreen({
  projects,
  sharedPaths,
  onSelect,
  onShare,
  onQuit,
}: ProjectListScreenProps) {
  const [firstName, setFirstName] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    getFirstName().then(setFirstName).catch(() => setFirstName(null));
  }, []);

  // Sort: unshared first, shared at bottom
  const sorted = [...projects].sort((a, b) => {
    const aShared = sharedPaths.has(a.path) ? 1 : 0;
    const bShared = sharedPaths.has(b.path) ? 1 : 0;
    if (aShared !== bShared) return aShared - bShared;
    return a.path.localeCompare(b.path);
  });

  const items: ListItem<string>[] = sorted.map((p) => {
    const isShared = sharedPaths.has(p.path);
    const agents = p.agents
      .map((a) => {
        const count = p.sessionCounts[Object.keys(p.sessionCounts).find(
          (slug) => p.agents.includes(a),
        ) ?? ""] ?? 0;
        return `${a} (${count})`;
      })
      .join(" | ");

    return {
      label: shortenPath(p.path),
      value: p.path,
      description: agents,
      dimmed: isShared,
      suffix: isShared ? "[Shared]" : agents,
    };
  });

  useInput((input) => {
    if (input === "s" || input === "S") {
      const path = selectedPath ?? items[0]?.value;
      if (path && !sharedPaths.has(path)) {
        onShare(path);
      }
    }
  });

  if (projects.length === 0) {
    return (
      <Box flexDirection="column">
        <Header firstName={firstName} />
        <Text dimColor>No projects with AI coding sessions found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header firstName={firstName} />
      <Text bold>Discovered projects:</Text>
      <Box marginTop={1}>
        <ScrollableList
          items={items}
          onSelect={onSelect}
          onHighlight={(value) => setSelectedPath(value)}
          onKey={(input) => {
            if (input === "q" || input === "Q") {
              onQuit();
              return true;
            }
            if (input === "s" || input === "S") {
              const path = selectedPath ?? items[0]?.value;
              if (path && !sharedPaths.has(path)) {
                onShare(path);
              }
              return true;
            }
            return false;
          }}
        />
      </Box>
      <KeyHint
        hints={[
          { key: "↑↓", label: "navigate" },
          { key: "Enter", label: "stats" },
          { key: "S", label: "share" },
          { key: "Q", label: "quit" },
        ]}
      />
    </Box>
  );
}
