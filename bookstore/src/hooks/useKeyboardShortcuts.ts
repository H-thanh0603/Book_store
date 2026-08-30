"use client";

import { useEffect, useCallback } from "react";

type ShortcutMap = {
  [key: string]: () => void;
};

/**
 * Hook to register keyboard shortcuts
 * @param shortcuts - Map of key combinations to handlers
 * @param deps - Dependencies for the effect
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, deps: unknown[] = []) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Escape in inputs
        if (event.key === "Escape") {
          (target as HTMLInputElement).blur();
          return;
        }
        return;
      }

      const key = [
        event.ctrlKey && "ctrl",
        event.metaKey && "meta",
        event.shiftKey && "shift",
        event.altKey && "alt",
        event.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join("+");

      if (shortcuts[key]) {
        event.preventDefault();
        shortcuts[key]();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
    [shortcuts, ...deps]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Format shortcut for display
 * @example formatShortcut("ctrl+k") → "Ctrl+K"
 */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => {
      switch (part) {
        case "ctrl":
          return "Ctrl";
        case "meta":
          return "⌘";
        case "shift":
          return "Shift";
        case "alt":
          return "Alt";
        default:
          return part.toUpperCase();
      }
    })
    .join("+");
}
