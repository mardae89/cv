import { redirect } from "next/navigation";
import { currentUser, effectiveTier } from "@/lib/auth/session";
import { anonymousViewer, publicMode } from "@/lib/auth/public";
import { AppShell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await currentUser();
  // Public mode lets an instance be opened rather than signed up for.
  const user = signedIn ?? (publicMode() ? anonymousViewer() : null);
  if (!user) redirect("/login");
  if (signedIn && !signedIn.onboarded) redirect("/onboarding");

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
