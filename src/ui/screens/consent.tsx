import React from "react";
import { Box, Text, useInput } from "ink";
import { KeyHint } from "../components/key-hint.js";
import { CONTACT_EMAIL } from "../../config.js";

interface ConsentScreenProps {
  projectPath: string;
  onConfirm: () => void;
  onBack: () => void;
}

export function ConsentScreen({ projectPath, onConfirm, onBack }: ConsentScreenProps) {
  useInput((input, key) => {
    if (key.return) {
      onConfirm();
    } else if (key.escape) {
      onBack();
    }
  });

  const w = 56;
  const top = "╔" + "═".repeat(w) + "╗";
  const bot = "╚" + "═".repeat(w) + "╝";
  const empty = "║" + " ".repeat(w) + "║";
  const line = (text: string) => {
    const pad = Math.max(0, w - text.length);
    return "║  " + text + " ".repeat(Math.max(0, pad - 2)) + "║";
  };

  return (
    <Box flexDirection="column">
      <Text color="cyan">{top}</Text>
      <Text color="cyan">{empty}</Text>
      <Text color="cyan">
        {line("I give CodeSpeak permission to study my project.")}
      </Text>
      <Text color="cyan">{empty}</Text>
      <Text color="cyan">
        {line("CodeSpeak will NOT build commercial software")}
      </Text>
      <Text color="cyan">
        {line("that runs any of this code.")}
      </Text>
      <Text color="cyan">{empty}</Text>
      <Text color="cyan">
        {line(`To retract: email ${CONTACT_EMAIL}`)}
      </Text>
      <Text color="cyan">{empty}</Text>
      <Text color="cyan">{bot}</Text>

      <KeyHint
        hints={[
          { key: "Enter", label: "share", primary: true },
          { key: "Esc", label: "back" },
        ]}
      />
    </Box>
  );
}
