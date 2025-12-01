import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: () => void;
  description?: string;
}

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcut[]) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl === undefined || shortcut.ctrl === (e.ctrlKey || e.metaKey);
        const shiftMatch = shortcut.shift === undefined || shortcut.shift === e.shiftKey;
        const altMatch = shortcut.alt === undefined || shortcut.alt === e.altKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          e.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

export const DASHBOARD_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: 'e',
    ctrl: true,
    description: 'Export dashboard data',
    handler: () => {}, // Will be overridden
  },
  {
    key: 'r',
    ctrl: true,
    description: 'Refresh data',
    handler: () => {},
  },
  {
    key: 'f',
    ctrl: true,
    description: 'Focus search',
    handler: () => {},
  },
  {
    key: '1',
    ctrl: true,
    description: 'Switch to Overview',
    handler: () => {},
  },
  {
    key: '2',
    ctrl: true,
    description: 'Switch to Mind Map',
    handler: () => {},
  },
  {
    key: '3',
    ctrl: true,
    description: 'Switch to Metrics',
    handler: () => {},
  },
  {
    key: '4',
    ctrl: true,
    description: 'Switch to Timeline',
    handler: () => {},
  },
];
