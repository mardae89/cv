import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EMPTY_DB, type Database } from "./schema";
import { singleton } from "@/lib/utils/cache";

/**
 * DATA STORE.
 *
 * The production target is PostgreSQL via Prisma (`prisma/schema.prisma` mirrors
 * these entities). To keep the application runnable with zero infrastructure,
 * the default implementation is a JSON file store behind the same narrow
 * interface — swap `store` for a Prisma-backed implementation and nothing above
 * this file changes.
 *
 * If the filesystem is read-only (serverless), it degrades to memory and logs it.
 */

const DATA_DIR = process.env.MD_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

class JsonStore {
  private data: Database = structuredClone(EMPTY_DB);
  private persistent = true;
  private loaded = false;
  private writeQueued = false;
  private probed = false;

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Partial<Database>;
        this.data = { ...structuredClone(EMPTY_DB), ...raw };
      } else {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        this.flush();
      }
    } catch {
      this.persistent = false;
    }
  }

  private flush() {
    if (!this.persistent) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf8");
    } catch {
      this.persistent = false;
    }
  }

  private scheduleFlush() {
    if (this.writeQueued) return;
    this.writeQueued = true;
    setTimeout(() => {
      this.writeQueued = false;
      this.flush();
    }, 150);
  }

  read(): Database {
    this.load();
    return this.data;
  }

  /** Mutate the database and persist. Returns whatever the mutator returns. */
  write<T>(fn: (db: Database) => T): T {
    this.load();
    const result = fn(this.data);
    this.scheduleFlush();
    return result;
  }

  /**
   * Whether writes actually survive. This must PROBE, not assume: `persistent`
   * starts optimistic and is only cleared once a real read or write has failed,
   * so answering before the store has been touched reports a writable disk on a
   * host that has none — which is how a serverless deploy ends up offering a
   * login it cannot honour.
   */
  get isPersistent() {
    this.load();
    // Probe once per process: this is read on every request that renders the
    // shell, and a filesystem check per request would be wasteful.
    if (this.persistent && !this.probed) {
      this.probed = true;
      // A directory can exist and still reject writes; only a write proves it.
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const probe = path.join(DATA_DIR, ".write-probe");
        fs.writeFileSync(probe, "ok");
        fs.unlinkSync(probe);
      } catch {
        this.persistent = false;
      }
    }
    return this.persistent;
  }

  get storageLabel() {
    return this.persistent ? `JSON file (${DB_FILE})` : "In-memory (filesystem read-only)";
  }
}

export const store = singleton("store", () => new JsonStore());

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

export function log(level: "info" | "warn" | "error", scope: string, message: string, meta?: Record<string, unknown>) {
  store.write((db) => {
    db.logs.unshift({ id: newId("log"), at: Date.now(), level, scope, message, meta });
    if (db.logs.length > 500) db.logs.length = 500;
  });
}

export function recordUsage(userId: string | null, kind: "page-view" | "scan" | "ai-message" | "alert-trigger" | "asset-view", detail: string) {
  store.write((db) => {
    db.usage.unshift({ id: newId("use"), at: Date.now(), userId, kind, detail });
    if (db.usage.length > 3000) db.usage.length = 3000;
  });
}
