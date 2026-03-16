import React from "react";
import { Box, Text } from "ink";

export interface HintItem {
  key: string;
  label: string;
  primary?: boolean;
}

interface KeyHintProps {
  hints: HintItem[];
}

export function KeyHint({ hints }: KeyHintProps) {
  return (
    <Box marginTop={1} gap={2}>
      {hints.map((h) => {
        if (h.primary) {
          return (
            <Box key={h.key}>
              <Text inverse bold color="green">
                {" "}{h.key}{" "}
              </Text>
              <Text bold color="green">
                {" "}{h.label}
              </Text>
            </Box>
          );
        }
        return (
          <Box key={h.key}>
            <Text inverse dimColor>
              {" "}{h.key}{" "}
            </Text>
            <Text dimColor>
              {" "}{h.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
