"use client";

/**
 * The gear, in the top right corner of the screen.
 *
 * Not inside the control rail, though it sits directly above the rail's HIDE
 * handle and shares its right edge. The rail folds away, and a settings
 * button that folds away with it would leave no way back to Settings without
 * first bringing the rail out — which is the wrong order for a control that
 * can turn the rail's own contents on and off.
 *
 * It is anchored to `--chrome-top` like the rest of the top furniture, so on
 * a tablet in full screen it drops clear of the system's battery and wifi
 * along with everything else, and the rail still begins below it.
 */
export default function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open settings"
      className="pointer-events-auto rounded-lg border border-radar-panelborder bg-radar-panel/70 p-2 text-radar-textdim backdrop-blur-sm hover:text-radar-text"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}
