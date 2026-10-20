"use client";

import { useRef, useState } from "react";
import { Eyebrow, GhostButton, GoldButton, Panel } from "./primitives";
import { exportAll, importAll } from "@/lib/os/store";

/**
 * Becoming's data lives in this browser only, so the trader needs a way to keep
 * a copy and to move it to another device. One JSON file covers all of it.
 */
export function BackupPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function download() {
    const blob = new Blob([exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `md-trader-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded.");
  }

  return (
    <Panel className="p-5">
      <Eyebrow className="mb-2">Back up my journal &amp; plan</Eyebrow>
      <p className="text-sm text-mute">
        Your journal, trading plan, check-ins, vision board and reviews are stored in this browser only. Download a backup to keep a copy,
        or restore one to move everything to another phone or computer.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <GoldButton onClick={download}>Download backup</GoldButton>
        <GhostButton onClick={() => fileRef.current?.click()}>Restore from file</GhostButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (!window.confirm("Restoring replaces the journal, plan, check-ins, vision board and reviews on this device. Continue?")) return;
            const r = importAll(await f.text());
            setMessage(r.message);
          }}
        />
        {message ? <span className="text-xs text-gold">{message}</span> : null}
      </div>
    </Panel>
  );
}
