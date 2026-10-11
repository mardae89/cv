import { Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/format";
import { useFeedback } from "./feedback";
import { IconButton } from "./ui";

export interface RecordItem {
  id: string;
  primary: ReactNode;
  secondary?: ReactNode;
  right?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
  deleteWarning?: ReactNode;
}

export function RecordList({ items, empty, limit }: { items: RecordItem[]; empty?: ReactNode; limit?: number }) {
  const { confirm, toast } = useFeedback();
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="py-4 text-center text-[13px] text-faint">{empty ?? "Nothing logged yet."}</p>;
  const del = async (it: RecordItem) => {
    const ok = await confirm({
      title: `Delete ${it.deleteLabel ?? "this entry"}?`,
      body: it.deleteWarning ?? "This can't be undone. Totals, charts and milestones recalculate from the remaining records.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await it.onDelete!();
      toast("Deleted.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  // Names each row's buttons after the record, so screen readers can tell "Edit" on one row from the next.
  const named = (verb: string, it: RecordItem) => typeof it.primary === "string" ? `${verb} ${it.primary}` : verb;
  return (
    <ul className="divide-y divide-hair">
      {items.slice(0, all ? items.length : limit ?? items.length).map((it) => (
        <li key={it.id} className="flex items-center gap-2 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] text-bone">{it.primary}</div>
            {it.secondary && <div className="truncate text-[12px] text-mute">{it.secondary}</div>}
          </div>
          {it.right && <div className="num shrink-0 text-[13.5px] font-semibold text-bone">{it.right}</div>}
          {it.onEdit && <IconButton label={named("Edit", it)} className="h-9 w-9" onClick={it.onEdit}><Pencil className="h-4 w-4" /></IconButton>}
          {it.onDelete && <IconButton label={named("Delete", it)} className="h-9 w-9 hover:text-alert" onClick={() => del(it)}><Trash2 className="h-4 w-4" /></IconButton>}
        </li>
      ))}
      {!all && limit !== undefined && items.length > limit && (
        <li className="pt-3">
          <button className="text-[13px] text-gold hover:text-gold-hi" onClick={() => setAll(true)}>Show all {items.length}</button>
        </li>
      )}
    </ul>
  );
}
