import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  firstName?: string | null;
}

export function Header({ firstName }: HeaderProps) {
  const greeting = firstName ? `Hi ${firstName}!` : "Hi!";
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        {greeting}
      </Text>
    </Box>
  );
}
