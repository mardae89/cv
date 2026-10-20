import { AppShell } from "@/components/shell";
import { anonymousViewer } from "@/lib/auth/public";

/** No sign-in, no redirect, no gate. The app opens. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = anonymousViewer();
  return (
    <AppShell user={{ id: user.id, name: user.name, email: user.email, role: user.role, tier: user.tier }}>
      {children}
    </AppShell>
  );
}
