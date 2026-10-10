// Reads of the partner's data. Everything here passes through RLS and the
// get_partner_overview() function, so the partner sees only what the owner
// shares — hiding UI is never the protection.
import { useQuery } from "@tanstack/react-query";
import type { AchievementRow, JournalEntry, PartnerOverview, Review, WeightEntry, Workout } from "@/lib/types";
import { fetchAll, useStore } from "./store";
import { supabase } from "./supabase";

export function usePartnerOverview() {
  const { uid, partnership } = useStore();
  const active = partnership?.status === "active";
  return useQuery({
    queryKey: ["partner", uid, "overview", partnership?.id],
    enabled: active,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_partner_overview");
      if (error) throw error;
      return data as PartnerOverview | null;
    },
  });
}

export function usePartnerRecords(partnerId: string | undefined, levels: PartnerOverview["levels"] | undefined) {
  return useQuery({
    queryKey: ["partner", partnerId, "records", levels],
    enabled: !!partnerId && !!levels,
    queryFn: async () => {
      const id = partnerId!;
      const [achievements, journal, reviews, weights, workouts] = await Promise.all([
        fetchAll<AchievementRow>("achievements", "user_id", id, "achieved_on"),
        fetchAll<JournalEntry>("journal_entries", "user_id", id, "entry_date"),
        fetchAll<Review>("reviews", "user_id", id, "period_start"),
        levels!.weight === "full" ? fetchAll<WeightEntry>("weight_entries", "user_id", id, "entry_date") : Promise.resolve([]),
        levels!.training === "full" ? fetchAll<Workout>("workouts", "user_id", id, "workout_date") : Promise.resolve([]),
      ]);
      return { achievements, journal, reviews, weights, workouts };
    },
  });
}
