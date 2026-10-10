// Works out where the app is running and opens the right storage:
//   • inside the published claude.ai page → that page's private database,
//     synced across devices and between the two of you
//   • anywhere else (a saved copy, a website) → this browser's own storage
import { DeviceStore, MemoryStore, SharedPageStore, type ClaudeDb, type DocStore } from "./docstore";

interface ClaudeUser {
  id(): Promise<string | null>;
  me(): Promise<{ id: string | null; name: string }>;
  profiles(ids: string[]): Promise<Record<string, { id: string; name: string }>>;
}
interface ClaudeDownloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

export interface Host {
  /** "shared-page": synced through the claude.ai page. "device": this browser only. */
  mode: "shared-page" | "device";
  store: DocStore;
  uid: string;
  displayName: string;
  /** Why we fell back to device storage, when we did. */
  notice: string | null;
  user: ClaudeUser | null;
  downloads: ClaudeDownloads | null;
  /** True inside the claude.ai frame (no browser downloads, no Web Share, no hash URLs from outside). */
  framed: boolean;
}

const claude = (): ClaudeHost | undefined => (window as unknown as { claude?: ClaudeHost }).claude;

/** Inside another page's frame (the claude.ai viewer): no address bar, no plain downloads. */
export const isFramed = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

async function deviceStore(): Promise<{ store: DocStore; notice: string | null }> {
  try {
    return { store: await DeviceStore.open(), notice: null };
  } catch {
    return { store: new MemoryStore(), notice: "This browser is blocking storage, so nothing will be kept after you close the page. Export a backup before leaving." };
  }
}

export async function detectHost(): Promise<Host> {
  const c = claude();
  if (c && typeof c.use === "function") {
    const [db, user, downloads] = await Promise.all([
      c.use("db").catch(() => null) as Promise<ClaudeDb | null>,
      c.use("user").catch(() => null) as Promise<ClaudeUser | null>,
      c.use("downloads").catch(() => null) as Promise<ClaudeDownloads | null>,
    ]);
    const uid = user ? await user.id().catch(() => null) : null;
    const name = user ? (await user.me().catch(() => ({ name: "" }))).name : "";
    if (db && uid) {
      const store = new SharedPageStore(db);
      // One small write proves this person may save here (view-only shares can't).
      try {
        await store.set(`data/users/${uid}/hello`, { seen: new Date().toISOString().slice(0, 10) });
        return { mode: "shared-page", store, uid, displayName: name, notice: null, user, downloads, framed: isFramed() };
      } catch {
        const local = await deviceStore();
        return {
          mode: "device", store: local.store, uid: "local", displayName: name, user, downloads, framed: isFramed(),
          notice: "Your access to this page is view-only, so your records are saved in this browser instead. Ask the owner to invite you as an Editor to sync them.",
        };
      }
    }
    const local = await deviceStore();
    return {
      mode: "device", store: local.store, uid: "local", displayName: name, user, downloads, framed: isFramed(),
      notice: local.notice ?? (isFramed() ? "Sign in to Claude to sync your records. For now they're saved in this browser only." : null),
    };
  }
  const local = await deviceStore();
  return { mode: "device", store: local.store, uid: "local", displayName: "", notice: local.notice, user: null, downloads: null, framed: isFramed() };
}

/** Offer a file to the viewer: through the page's save dialog when framed, a normal download otherwise. */
export async function saveFile(host: Host, filename: string, data: string | Blob): Promise<"saved" | "declined"> {
  if (host.downloads) {
    try {
      await host.downloads.save({ filename, data });
      return "saved";
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "declined") return "declined";
      throw new Error(code === "rate_limited" ? "A save is already waiting for your answer." : "Saving files isn't available here.");
    }
  }
  if (host.framed) throw new Error("Saving files isn't available in this view.");
  const blob = typeof data === "string" ? new Blob([data], { type: filename.endsWith(".json") ? "application/json" : "text/plain" }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "saved";
}
