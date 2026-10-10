import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { supabase } from "@/data/supabase";
import { cx } from "./ui";

/** Private photos are served through short-lived signed URLs. */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("progress-photos").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function Photo({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const { data: url, isError, isLoading } = useSignedUrl(path);
  return (
    <div className={cx("relative overflow-hidden rounded-xl bg-raised", className)}>
      {url && <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" />}
      {isLoading && <div className="absolute inset-0 animate-pulse bg-raised" />}
      {isError && <div className="absolute inset-0 flex items-center justify-center text-faint"><ImageOff className="h-5 w-5" /></div>}
    </div>
  );
}
