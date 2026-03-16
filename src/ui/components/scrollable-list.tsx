import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";

export interface ListItem<T = string> {
  label: string;
  value: T;
  description?: string;
  dimmed?: boolean;
  suffix?: string;
}

interface ScrollableListProps<T> {
  items: ListItem<T>[];
  pageSize?: number;
  onSelect?: (value: T) => void;
  onHighlight?: (value: T, index: number) => void;
  /** Additional key handlers. Return true if handled. */
  onKey?: (input: string, key: { return: boolean; escape: boolean }) => boolean;
  active?: boolean;
  indicator?: string;
  /** Called when cursor is at edge and user presses beyond it. */
  onBoundary?: (direction: "up" | "down") => void;
  /** Initial cursor position. */
  initialCursor?: number;
}

export function ScrollableList<T>({
  items,
  pageSize: pageSizeProp,
  onSelect,
  onHighlight,
  onKey,
  active = true,
  indicator = ">",
  onBoundary,
  initialCursor = 0,
}: ScrollableListProps<T>) {
  const { stdout } = useStdout();
  const terminalPageSize = Math.max(5, (stdout.rows ?? 24) - 8);
  const pageSize = pageSizeProp ?? terminalPageSize;
  const [cursor, setCursor] = useState(initialCursor);

  const moveCursor = useCallback(
    (delta: number) => {
      setCursor((prev) => {
        // Skip dimmed items
        let next = prev + delta;
        while (next >= 0 && next < items.length && items[next]!.dimmed) {
          next += delta;
        }
        if (next < 0 || next >= items.length) return prev;
        onHighlight?.(items[next]!.value, next);
        return next;
      });
    },
    [items, onHighlight],
  );

  const isAtBoundary = useCallback(
    (direction: "up" | "down"): boolean => {
      const delta = direction === "up" ? -1 : 1;
      let next = cursor + delta;
      while (next >= 0 && next < items.length && items[next]!.dimmed) {
        next += delta;
      }
      return next < 0 || next >= items.length;
    },
    [cursor, items],
  );

  useInput(
    (input, key) => {
      if (!active) return;

      // Let parent handle keys first
      if (onKey?.(input, { return: key.return, escape: key.escape })) return;

      if (key.upArrow) {
        if (isAtBoundary("up")) {
          onBoundary?.("up");
        } else {
          moveCursor(-1);
        }
      } else if (key.downArrow) {
        if (isAtBoundary("down")) {
          onBoundary?.("down");
        } else {
          moveCursor(1);
        }
      } else if (key.return && onSelect && items[cursor]) {
        onSelect(items[cursor]!.value);
      }
    },
    { isActive: active },
  );

  // Calculate visible window
  const halfPage = Math.floor(pageSize / 2);
  let start = Math.max(0, cursor - halfPage);
  const end = Math.min(items.length, start + pageSize);
  if (end - start < pageSize) {
    start = Math.max(0, end - pageSize);
  }

  const visible = items.slice(start, end);

  return (
    <Box flexDirection="column">
      {start > 0 && (
        <Text dimColor>  {"↑"} {start} more</Text>
      )}
      {visible.map((item, i) => {
        const realIndex = start + i;
        const isCurrent = realIndex === cursor;
        const showHighlight = isCurrent && active;
        return (
          <Box key={realIndex}>
            <Text color={showHighlight ? "cyan" : undefined} bold={showHighlight} dimColor={item.dimmed || (!active && !isCurrent)}>
              {showHighlight ? ` ${indicator} ` : "   "}
              {item.label}
            </Text>
            {item.suffix && (
              <Text dimColor={!showHighlight || item.dimmed} color={showHighlight && !item.dimmed ? "cyan" : undefined}>
                {"  "}{item.suffix}
              </Text>
            )}
          </Box>
        );
      })}
      {end < items.length && (
        <Text dimColor>  {"↓"} {items.length - end} more</Text>
      )}
    </Box>
  );
}
