import React, { useState } from "react";
import { Box, Text } from "ink";
import type { DiscoveredProject } from "../../sessions/types.js";
import { TabBar } from "../components/tab-bar.js";
import { ActionBar } from "../components/action-bar.js";
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

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} />

      <TabBar tabs={tabs} activeTab={activeTab} onSwitch={onSwitchTab} active={!hasActivePreview} useArrows={false} />
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

      <ActionBar
        actions={[
          { label: "Share", onAction: onShare, primary: true },
          { label: "Back", onAction: onBack },
        ]}
        active={!hasActivePreview}
        onEsc={onBack}
      />
    </Box>
  );
}
