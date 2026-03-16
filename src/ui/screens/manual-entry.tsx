import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { KeyHint } from "../components/key-hint.js";

interface ManualEntryScreenProps {
  gitRoot: string;
  onDone: (projectPath: string) => void;
  onBack: () => void;
}

/**
 * Step 2.B: Manual session entry for when no agent sessions are found.
 * This is a placeholder that will be fleshed out in Phase 6.
 */
export function ManualEntryScreen({
  gitRoot,
  onDone,
  onBack,
}: ManualEntryScreenProps) {
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
    } else if (key.return) {
      // For now, proceed with the project as-is
      onDone(gitRoot);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="yellow">
        No AI coding sessions found for this project.
      </Text>
      <Text dimColor>Project: {gitRoot}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          This screen will let you specify which agents you used
        </Text>
        <Text>
          and enter paths to session directories.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>Press Enter to continue with project sharing, or Esc to go back.</Text>
      </Box>
      <KeyHint
        hints={[
          { key: "Enter", label: "continue" },
          { key: "Esc", label: "back" },
        ]}
      />
    </Box>
  );
}
