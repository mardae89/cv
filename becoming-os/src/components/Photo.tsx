import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/data/store";
import type { Engine } from "@/data/engine";
import { cx } from "./ui";

// Photos are stored as JPEG data URLs keyed by the photo's id, and never
// change once saved. The ones already read are kept here (most recent few
// dozen) so thumbnails don't re-read storage on every render.
const KEEP = 40;
const cache = new Map<string, string>();
const reads = new Map<string, Promise<string | null>>();

function keep(id: string, url: string) {
  cache.delete(id);
  cache.set(id, url);
  while (cache.size > KEEP) cache.delete(cache.keys().next().value!);
}

/** Show a photo that was just saved without reading it back. */
export function rememberPhoto(id: string, dataUrl: string) {
  keep(id, dataUrl);
}

/** Forget a photo once it's deleted. */
export function forgetPhoto(id: string) {
  cache.delete(id);
  reads.delete(id);
}

function readPhoto(engine: Engine, id: string): Promise<string | null> {
  let p = reads.get(id);
  if (!p) {
    p = engine.getImage(id).then((url) => {
      if (url) keep(id, url);
      else cache.delete(id);
      return url;
    });
    const mine = p;
    mine.finally(() => reads.get(id) === mine && reads.delete(id)).catch(() => undefined);
    reads.set(id, p);
  }
  return p;
}

export function usePhotoUrl(id: string | null | undefined): { url: string | null; status: "loading" | "ready" | "missing" } {
  const { engine } = useStore();
  const [got, setGot] = useState<{ id: string; url: string | null } | null>(() => (id && cache.has(id) ? { id, url: cache.get(id)! } : null));
  useEffect(() => {
    if (!id) return;
    const hit = cache.get(id);
    if (hit) {
      setGot((g) => (g?.id === id && g.url === hit ? g : { id, url: hit }));
      return;
    }
    let alive = true;
    readPhoto(engine, id).then(
      (url) => alive && setGot({ id, url }),
      () => alive && setGot({ id, url: null }),
    );
    return () => {
      alive = false;
    };
  }, [id, engine]);
  if (!id) return { url: null, status: "missing" };
  if (got?.id !== id) return cache.has(id) ? { url: cache.get(id)!, status: "ready" } : { url: null, status: "loading" };
  return got.url ? { url: got.url, status: "ready" } : { url: null, status: "missing" };
}

export function Photo({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const { url, status } = usePhotoUrl(id);
  return (
    <div className={cx("relative overflow-hidden rounded-xl bg-raised", className)}>
      {url && <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" />}
      {status === "loading" && <div className="absolute inset-0 animate-pulse bg-raised" />}
      {status === "missing" && <div className="absolute inset-0 flex items-center justify-center text-faint" title="Photo unavailable"><ImageOff className="h-5 w-5" /></div>}
    </div>
  );
}
