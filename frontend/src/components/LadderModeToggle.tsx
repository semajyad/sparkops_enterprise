"use client";

interface LadderModeToggleProps {
  enabled: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

export function LadderModeToggle({ enabled, disabled = false, onChange }: LadderModeToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={[
        "relative w-full rounded-2xl border px-6 py-5 text-left transition",
        enabled
          ? "border-emerald-300 bg-emerald-500/20 text-emerald-50"
          : "border-rose-300 bg-rose-500/15 text-rose-50",
        disabled ? "cursor-not-allowed opacity-60" : "hover:scale-[1.01]",
      ].join(" ")}
    >
      <span className="block text-xs uppercase tracking-[0.24em]">Ladder Mode</span>
      <span className="mt-1 block text-2xl font-bold">{enabled ? "ACTIVE" : "OFF"}</span>
      <span className="mt-2 block text-sm opacity-90">
        {enabled ? "Calls route to AI voicemail triage." : "Direct call flow restored."}
      </span>
    </button>
  );
}
