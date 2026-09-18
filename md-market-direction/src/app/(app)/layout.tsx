import { redirect } from "next/navigation";
import { currentUser, effectiveTier } from "@/lib/auth/session";
import { AppShell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.onboarded) redirect("/onboarding");

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tier: effectiveTier(user),
      }}
    >
      {children}
    </AppShell>
  );
}
