import React from "react";
import { Box, Text } from "ink";

interface KeyHintProps {
  hints: Array<{ key: string; label: string }>;
}

export function KeyHint({ hints }: KeyHintProps) {
  return (
    <Box marginTop={1}>
      <Text dimColor>
        {hints.map((h, i) => (
          <React.Fragment key={h.key}>
            {i > 0 && "   "}
            <Text bold dimColor>
              {h.key}
            </Text>
            {" "}
            {h.label}
          </React.Fragment>
        ))}
      </Text>
    </Box>
  );
}
