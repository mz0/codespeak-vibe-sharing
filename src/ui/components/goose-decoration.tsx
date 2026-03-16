import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

/**
 * Animated gratitude art frames.
 * Ported from src/ui/goose.ts for use in ink components.
 */
const FRAMES: string[][] = [
  [
    "💛       💛",
    "  💚   💚  ",
    "    💙     ",
    "  THANK    ",
    "   YOU!    ",
    "  💜   💜  ",
    "💖       💖",
  ],
  [
    "🌟 🌟 🌟 🌟",
    "🌟        🌟",
    "🌟  YOU   🌟",
    "🌟  ARE   🌟",
    "🌟AMAZING!🌟",
    "🌟        🌟",
    "🌟 🌟 🌟 🌟",
  ],
  [
    "🎉  🙏  🎉",
    "   SO      ",
    "   MUCH    ",
    " GRATITUDE!",
    "    🙏     ",
    "🎊  🙌  🎊",
    "           ",
  ],
  [
    "  🏆🏆🏆  ",
    "  🏆#1!🏆 ",
    "  🏆🏆🏆  ",
    "    💪     ",
    " YOU'RE THE",
    "   BEST!   ",
    "  🔥🔥🔥  ",
  ],
];

interface GooseDecorationProps {
  animate?: boolean;
  intervalMs?: number;
}

export function GooseDecoration({
  animate = true,
  intervalMs = 2000,
}: GooseDecorationProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % FRAMES.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [animate, intervalMs]);

  const frame = FRAMES[frameIndex % FRAMES.length]!;

  return (
    <Box flexDirection="column" marginRight={2}>
      {frame.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}
