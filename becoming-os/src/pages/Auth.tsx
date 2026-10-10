import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button, Field, Input, Notice, Segmented } from "@/components/ui";
import { useAuth } from "@/data/auth";
import { supabase } from "@/data/supabase";
import { fmtDate, MISSION_END, MISSION_START } from "@/lib/dates";
import { errorMessage } from "@/lib/format";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,162,76,0.10),transparent_55%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-5xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-rise">
          <div className="mb-8 flex items-baseline gap-2">
            <span className="font-display text-[26px] font-semibold tracking-[0.2em]">BECOMING</span>
            <span className="text-[11px] font-bold tracking-[0.3em] text-gold">OS</span>
          </div>
          <h1 className="text-[46px] leading-[0.98] sm:text-[60px]">
            Build the body.<br />Build the business.<br /><span className="italic text-gold">Build the man.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-mute">
            Every action recorded. Every milestone earned. Every month a new chapter.
          </p>
          <div className="mt-8 flex gap-8 border-t border-hair pt-6 text-[13px]">
            <div><div className="eyebrow mb-1">Begins</div><div className="num text-bone">{fmtDate(MISSION_START)}</div></div>
            <div><div className="eyebrow mb-1">Ends</div><div className="num text-bone">{fmtDate(MISSION_END)}</div></div>
            <div><div className="eyebrow mb-1">Span</div><div className="num text-bone">227 days</div></div>
          </div>
        </div>
        <div className="card animate-rise p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

export function AuthPage() {
  const { user } = useAuth();
  const loc = useLocation();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode !== "forgot" && password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "signup") {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim(), timezone }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setInfo("Account created. Check your email to confirm it, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      const m = errorMessage(err);
      setError(/Invalid login/i.test(m) ? "Email or password is incorrect." : m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      {mode !== "forgot" && (
        <Segmented className="mb-6 w-full" value={mode} onChange={(v) => { setMode(v); setError(null); setInfo(null); }}
          options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Create account" }]} />
      )}
      {mode === "forgot" && <h2 className="mb-5 text-[30px]">Reset password</h2>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === "signup" && (
          <Field label="Your name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} required />
          </Field>
        )}
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        {mode !== "forgot" && (
          <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
          </Field>
        )}
        {error && <Notice tone="alert">{error}</Notice>}
        {info && <Notice tone="gold">{info}</Notice>}
        <Button type="submit" size="lg" className="w-full" busy={busy}>
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </Button>
      </form>
      <div className="mt-5 text-center text-[13px]">
        {mode === "signin" && <button className="link" onClick={() => { setMode("forgot"); setError(null); }}>Forgot password?</button>}
        {mode === "forgot" && <button className="link" onClick={() => { setMode("signin"); setInfo(null); }}>Back to sign in</button>}
        {mode === "signup" && <p className="text-faint">Each of you creates your own account. You can connect them afterwards and choose exactly what to share.</p>}
      </div>
    </Frame>
  );
}

export function ResetPasswordPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await supabase.auth.signOut();
    nav("/auth", { replace: true });
  };

  return (
    <Frame>
      <h2 className="mb-5 text-[30px]">Choose a new password</h2>
      {!user ? (
        <Notice tone="alert">This reset link is invalid or has expired. Request a new one from the sign-in page.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" hint="At least 8 characters.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          {error && <Notice tone="alert">{error}</Notice>}
          <Button type="submit" size="lg" className="w-full" busy={busy}>Update password</Button>
        </form>
      )}
    </Frame>
  );
}
