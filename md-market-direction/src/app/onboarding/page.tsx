import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { OnboardingFlow } from "@/components/onboarding";

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.onboarded) redirect("/dashboard");
  return <OnboardingFlow name={user.name} />;
}
