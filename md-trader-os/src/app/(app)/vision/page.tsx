"use client";

import { useRef, useState } from "react";
import { EmptyState, Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { Bar, ConfirmButton, Field, LocalNote, Modal, Segmented, TextArea, TextInput, num } from "@/components/os";
import { Icon } from "@/components/icons";
import { uid, useVision, type VisionItem } from "@/lib/os/store";

type Kind = VisionItem["kind"];

/**
 * Uploaded images are re-encoded at a modest size before they are stored. A
 * phone photo is several megabytes; the browser's storage for the whole app is
 * about five, so storing originals would fill it with two pictures.
 */
async function shrink(file: File, max = 900, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file could not be read as an image."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is not available in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function VisionPage() {
  const [items, save, ready] = useVision();
  const [adding, setAdding] = useState<Kind | null>(null);
  const [editing, setEditing] = useState<VisionItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persist = (next: VisionItem[]) => {
    const ok = save(next);
    // Put the board back as it was, so what is on screen is what is stored.
    if (!ok) save(items);
    setError(ok ? null : "This browser's storage is full, so the change was not saved. Remove an image or use an image link instead of an upload.");
    return ok;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading
        title="Vision Board"
        subtitle="What all this discipline is for. Look at it before the session, and every time you feel the pull to break a rule."
        action={<GoldButton onClick={() => setAdding("image")}><Icon.plus className="h-4 w-4" /> Add</GoldButton>}
      />

      {error ? <div className="border border-bear/40 bg-bear/10 px-4 py-3 text-sm text-bear">{error}</div> : null}

      {!ready ? (
        <Skeleton className="h-80" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Build your board"
          message="Add a picture of the life you are trading for, a goal you are working toward, and the words you need to hear on a red day."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <GoldButton onClick={() => setAdding("image")}>Add an image</GoldButton>
              <GhostButton onClick={() => setAdding("goal")}>Add a goal</GhostButton>
              <GhostButton onClick={() => setAdding("affirmation")}>Add an affirmation</GhostButton>
            </div>
          }
        />
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {items.map((item) => <VisionCard key={item.id} item={item} onEdit={() => setEditing(item)} />)}
        </div>
      )}

      <LocalNote />

      {adding || editing ? (
        <VisionEditor
          initial={editing}
          kind={editing?.kind ?? adding!}
          onClose={() => { setAdding(null); setEditing(null); }}
          onSave={(item) => {
            const next = editing ? items.map((x) => (x.id === item.id ? item : x)) : [item, ...items];
            if (persist(next)) { setAdding(null); setEditing(null); }
          }}
          onDelete={editing ? () => {
            persist(items.filter((x) => x.id !== editing.id));
            setEditing(null);
          } : undefined}
        />
      ) : null}
    </div>
  );
}

function VisionCard({ item, onEdit }: { item: VisionItem; onEdit: () => void }) {
  if (item.kind === "affirmation") {
    return (
      <button onClick={onEdit} className="block w-full break-inside-avoid border-l-2 border-gold bg-panel p-5 text-left transition hover:bg-panel-2">
        <p className="display text-xl font-bold leading-snug tracking-tight">{item.text || item.title}</p>
        {item.title && item.text ? <p className="mt-2 text-[10px] uppercase tracking-widest text-faint">{item.title}</p> : null}
      </button>
    );
  }
  if (item.kind === "goal") {
    const progress = item.target ? (item.current ?? 0) / item.target : 0;
    return (
      <button onClick={onEdit} className="panel block w-full break-inside-avoid p-5 text-left transition hover:border-gold/40">
        <Eyebrow className="mb-1 text-gold">Goal{item.deadline ? ` · by ${new Date(item.deadline).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : ""}</Eyebrow>
        <div className="display text-lg font-bold">{item.title}</div>
        {item.target ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="ticker">{item.unit}{(item.current ?? 0).toLocaleString()} <span className="text-faint">of {item.unit}{item.target.toLocaleString()}</span></span>
              <span className="ticker text-gold">{Math.round(progress * 100)}%</span>
            </div>
            <Bar value={progress} tone={progress >= 1 ? "bull" : "gold"} />
          </div>
        ) : null}
        {item.text ? <p className="mt-3 text-sm text-mute">{item.text}</p> : null}
      </button>
    );
  }
  return (
    <button onClick={onEdit} className="panel block w-full break-inside-avoid overflow-hidden text-left transition hover:border-gold/40">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.title || "Vision board image"} className="block w-full" />
      ) : null}
      {item.title || item.text ? (
        <div className="p-4">
          {item.title ? <div className="display text-sm font-bold">{item.title}</div> : null}
          {item.text ? <p className="mt-1 text-sm text-mute">{item.text}</p> : null}
        </div>
      ) : null}
    </button>
  );
}

function VisionEditor({
  initial, kind: initialKind, onClose, onSave, onDelete,
}: {
  initial: VisionItem | null;
  kind: Kind;
  onClose: () => void;
  onSave: (item: VisionItem) => void;
  onDelete?: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [link, setLink] = useState(initial?.image && !initial.image.startsWith("data:") ? initial.image : "");
  const [current, setCurrent] = useState(initial?.current != null ? String(initial.current) : "");
  const [target, setTarget] = useState(initial?.target != null ? String(initial.target) : "");
  const [unit, setUnit] = useState(initial?.unit ?? "$");
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const finalImage = kind === "image" ? (link.trim() || image) : null;
  const valid =
    kind === "image" ? Boolean(finalImage) : kind === "goal" ? Boolean(title.trim()) : Boolean(text.trim() || title.trim());

  return (
    <Modal title={initial ? "Edit" : "Add to your board"} onClose={onClose}>
      <div className="space-y-4">
        {!initial ? (
          <Segmented
            value={kind}
            onChange={setKind}
            options={[{ value: "image", label: "Image" }, { value: "goal", label: "Goal" }, { value: "affirmation", label: "Affirmation" }]}
          />
        ) : null}

        {kind === "image" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBusy(true);
                  setErr(null);
                  try {
                    setImage(await shrink(f));
                    setLink("");
                  } catch (ex) {
                    setErr((ex as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <GoldButton onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Processing…" : "Upload a photo"}</GoldButton>
              <span className="text-xs text-faint">or paste an image link below</span>
            </div>
            <TextInput value={link} onChange={setLink} placeholder="https://…/image.jpg" />
            {err ? <p className="text-xs text-bear">{err}</p> : null}
            {finalImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={finalImage} alt="Preview" className="max-h-64 w-full object-contain" />
            ) : null}
            <Field label="Title (optional)"><TextInput value={title} onChange={setTitle} placeholder="The house" /></Field>
            <Field label="Caption (optional)"><TextArea value={text} onChange={setText} rows={2} /></Field>
          </>
        ) : kind === "goal" ? (
          <>
            <Field label="Goal"><TextInput value={title} onChange={setTitle} placeholder="Pass my funded challenge" /></Field>
            <div className="grid grid-cols-[80px_1fr_1fr] gap-3">
              <Field label="Unit"><TextInput value={unit} onChange={setUnit} placeholder="$" /></Field>
              <Field label="Where I am"><TextInput value={current} onChange={setCurrent} inputMode="decimal" /></Field>
              <Field label="Target"><TextInput value={target} onChange={setTarget} inputMode="decimal" /></Field>
            </div>
            <Field label="By (optional)"><TextInput type="date" value={deadline} onChange={setDeadline} /></Field>
            <Field label="Why it matters"><TextArea value={text} onChange={setText} rows={3} /></Field>
          </>
        ) : (
          <>
            <Field label="Affirmation"><TextArea value={text} onChange={setText} rows={3} placeholder="I am a patient trader. I wait for my zone." /></Field>
            <Field label="Label (optional)"><TextInput value={title} onChange={setTitle} /></Field>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <GoldButton
            disabled={!valid || busy}
            onClick={() =>
              onSave({
                id: initial?.id ?? uid("vis"),
                kind,
                title: title.trim(),
                text: text.trim(),
                image: finalImage,
                current: kind === "goal" ? num(current) : null,
                target: kind === "goal" ? num(target) : null,
                unit: kind === "goal" ? unit : "",
                deadline: kind === "goal" && deadline ? deadline : null,
                createdAt: initial?.createdAt ?? Date.now(),
              })
            }
          >
            Save
          </GoldButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          {onDelete ? <ConfirmButton className="ml-auto" label="Remove" confirmLabel="Tap again to remove" onConfirm={onDelete} /> : null}
        </div>
      </div>
    </Modal>
  );
}
