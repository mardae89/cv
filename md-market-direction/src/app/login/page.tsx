import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.onboarded ? "/dashboard" : "/onboarding");
  return <AuthForm mode="login" />;
}
