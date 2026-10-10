import { AlertTriangle, Check, Info } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, cx, Sheet } from "./ui";

interface ToastItem {
  id: number;
  tone: "success" | "error" | "info";
  text: string;
}

interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Requires typing this word to enable the confirm button. */
  typeToConfirm?: string;
}

interface Feedback {
  toast: (text: string, tone?: ToastItem["tone"]) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}

const Ctx = createContext<Feedback | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState("");
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: ToastItem["tone"] = "success") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6500 : 3200);
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => {
    setTyped("");
    setDialog({ ...o, resolve });
  }), []);

  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
              className={cx("pointer-events-auto flex max-w-md animate-rise items-start gap-2.5 rounded-2xl border bg-raised px-4 py-3 text-[13.5px] shadow-2xl shadow-black/60",
                t.tone === "error" ? "border-alert/50 text-bone" : "border-line text-bone")}>
              {t.tone === "success" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                : t.tone === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert" />
                : <Info className="mt-0.5 h-4 w-4 shrink-0 text-mute" />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Sheet open={!!dialog} onClose={() => close(false)} title={dialog?.title ?? ""}>
        {dialog && (
          <div>
            {dialog.body && <div className="mb-5 text-[14px] leading-relaxed text-mute">{dialog.body}</div>}
            {dialog.typeToConfirm && (
              <label className="mb-5 block text-[13px] text-mute">
                Type <span className="font-semibold text-bone">{dialog.typeToConfirm}</span> to confirm
                <input className="input mt-2" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
              <Button variant={dialog.destructive ? "danger" : "primary"}
                disabled={!!dialog.typeToConfirm && typed.trim() !== dialog.typeToConfirm}
                onClick={() => close(true)}>
                {dialog.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </Ctx.Provider>
  );
}

export function useFeedback(): Feedback {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeedback outside FeedbackProvider");
  return c;
}
