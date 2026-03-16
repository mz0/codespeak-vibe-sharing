import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { DiscoveredProject } from "../../sessions/types.js";
import { TabBar } from "../components/tab-bar.js";
import { KeyHint } from "../components/key-hint.js";
import { AgentTab } from "./review/agent-tab.js";
import { CodeTab } from "./review/code-tab.js";
import { GitTab } from "./review/git-tab.js";

interface ReviewScreenProps {
  projectPath: string;
  activeTab: string;
  projects: DiscoveredProject[];
  onSwitchTab: (tab: string) => void;
  onShare: () => void;
  onBack: () => void;
}

export function ReviewScreen({
  projectPath,
  activeTab,
  projects,
  onSwitchTab,
  onShare,
  onBack,
}: ReviewScreenProps) {
  const project = projects.find((p) => p.path === projectPath);
  const [hasActivePreview, setHasActivePreview] = useState(false);

  // Build tabs: one per agent + Code + git
  const agentTabs = (project?.agents ?? []).map((a) => {
    const slug = Object.keys(project?.sessionCounts ?? {}).find((s) =>
      a.toLowerCase().replace(/\s+/g, "-").includes(s),
    ) ?? a;
    const count = project?.sessionCounts[slug] ?? 0;
    return { id: `agent:${slug}`, label: `${a} (${count})` };
  });
  const tabs = [
    ...agentTabs,
    { id: "code", label: "Code" },
    { id: "git", label: "git" },
  ];

  useInput((input, key) => {
    if (hasActivePreview) return; // Let sub-component handle Esc
    if (key.escape) {
      onBack();
    } else if (input === "s" || input === "S") {
      onShare();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} />


      <TabBar tabs={tabs} activeTab={activeTab} onSwitch={onSwitchTab} active={!hasActivePreview} />
      <Text dimColor>{"─".repeat(50)}</Text>

      <Box marginTop={1} flexDirection="column">
        {activeTab.startsWith("agent:") && (
          <AgentTab
            projectPath={projectPath}
            agentSlug={activeTab.replace("agent:", "")}
            onPreviewChange={setHasActivePreview}
          />
        )}
        {activeTab === "code" && (
          <CodeTab
            projectPath={projectPath}
            onPreviewChange={setHasActivePreview}
          />
        )}
        {activeTab === "git" && <GitTab projectPath={projectPath} />}
      </Box>

      <KeyHint
        hints={[
          { key: "Tab/←→", label: "switch tabs" },
          { key: "S", label: "share", primary: true },
          { key: "Esc", label: "back" },
        ]}
      />
    </Box>
  );
}
