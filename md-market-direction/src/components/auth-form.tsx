"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "./logo";
import { GoldButton } from "./primitives";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "signup"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      router.push(mode === "signup" || !json.onboarded ? "/onboarding" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-block"><Logo size={32} /></Link>

        <h1 className="display text-2xl font-extrabold uppercase tracking-tight">
          {mode === "login" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-mute">
          {mode === "login" ? "Your market command center is waiting." : "Know the direction. Understand the why."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" ? (
            <div>
              <label className="eyebrow mb-1.5 block">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 text-sm" placeholder="Your name" />
            </div>
          ) : null}
          <div>
            <label className="eyebrow mb-1.5 block">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 text-sm" placeholder="you@example.com" autoComplete="email"
            />
          </div>
          <div>
            <label className="eyebrow mb-1.5 block">Password</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-sm" placeholder="At least 8 characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error ? <p className="border border-bear/30 bg-bear/5 px-3 py-2 text-xs text-bear">{error}</p> : null}

          <GoldButton type="submit" disabled={busy} className="w-full py-3">
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </GoldButton>
        </form>

        <p className="mt-6 text-center text-xs text-mute">
          {mode === "login" ? (
            <>New here? <Link href="/signup" className="text-gold hover:underline">Create an account</Link></>
          ) : (
            <>Already have an account? <Link href="/login" className="text-gold hover:underline">Sign in</Link></>
          )}
        </p>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-faint">
          MD Market Direction provides market analysis and educational information, not investment advice. You are responsible for your own
          trading decisions.
        </p>
      </div>
    </div>
  );
}
