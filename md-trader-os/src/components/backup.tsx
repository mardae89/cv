"use client";

import { useEffect, useRef, useState } from "react";
import { Eyebrow, GhostButton, GoldButton, Panel } from "./primitives";
import { exportAll, importAll } from "@/lib/os/store";
import { isPreview } from "@/lib/route";

/**
 * Becoming's data lives in this browser only, so the trader needs a way to keep
 * a copy and to move it to another device. One JSON file covers all of it.
 */
export function BackupPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPreview(isPreview()), []);

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
      {preview ? (
        <p className="mt-2 text-xs text-gold">Downloads are blocked in this preview. Backup works in the deployed app.</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <GoldButton onClick={download} disabled={preview}>Download backup</GoldButton>
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
            setMessage(null);
            setPending({ name: f.name, text: await f.text() });
          }}
        />
        {message ? <span className="text-xs text-gold">{message}</span> : null}
      </div>
      {pending ? (
        <div className="mt-4 border border-bear/40 bg-bear/5 p-3">
          <p className="text-sm">
            Restore <span className="text-bone">{pending.name}</span>? It replaces the journal, plan, check-ins, vision board and reviews on
            this device.
          </p>
          <div className="mt-3 flex gap-2">
            <GoldButton
              onClick={() => {
                setMessage(importAll(pending.text).message);
                setPending(null);
              }}
            >
              Restore
            </GoldButton>
            <GhostButton onClick={() => setPending(null)}>Cancel</GhostButton>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
