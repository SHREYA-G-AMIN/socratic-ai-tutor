"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const title = isSignup ? "Create your account" : isForgot ? "Reset your password" : "Welcome back";
  const subtitle = isSignup
    ? "A calmer, more personal way to learn starts here."
    : isForgot
      ? "We’ll send you a link to reset your password."
      : "Pick up where your curiosity left off.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const supabase = createClient();
      const origin = window.location.origin;

      if (isForgot) {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/reset-password`,
        });
        if (authError) throw authError;
        setMessage("If an account exists for this email, a password reset link is on its way.");
      } else if (isSignup) {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: `${origin}/auth/callback?next=/`,
          },
        });
        if (authError) throw authError;
        if (data.session) router.replace("/");
        else setMessage("Check your inbox to confirm your email, then come back to sign in.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.replace("/");
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
      });
      if (authError) throw authError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in could not be started.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-background text-text-primary flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <Link href="/login" className="inline-flex items-center gap-3 mb-9 group">
          <span className="h-10 w-10 rounded-xl bg-accent-primary text-white grid place-items-center font-bold text-lg shadow-sm">S</span>
          <span>
            <span className="block text-base font-semibold tracking-tight">SocraticAI</span>
            <span className="block text-[11px] text-text-muted tracking-wide">TUTOR STUDIO</span>
          </span>
        </Link>

        <section className="rounded-3xl border border-border bg-surface p-7 sm:p-9 shadow-[0_24px_80px_rgba(25,20,30,0.10)]">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary mb-3">Your learning space</p>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{subtitle}</p>
          </div>

          {!isForgot && (
            <>
              <button type="button" onClick={handleGoogle} disabled={busy} className="w-full h-12 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors flex items-center justify-center gap-3 text-sm font-medium disabled:opacity-60">
                <svg viewBox="0 0 48 48" aria-hidden="true" className="h-[18px] w-[18px]"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.65 5.93c4.47-4.13 7.12-10.2 7.12-17.58Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" transform="translate(0 4)"/><path fill="#34A853" d="M24 48c6.47 0 11.91-2.13 15.88-5.87l-7.65-5.93c-2.13 1.43-4.85 2.28-8.23 2.28-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
                Continue with Google
              </button>
              <div className="flex items-center gap-4 my-6"><span className="h-px flex-1 bg-border"/><span className="text-[11px] uppercase tracking-widest text-text-muted">or with email</span><span className="h-px flex-1 bg-border"/></div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-2">Full name</span>
                <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/15 transition"/>
              </label>
            )}
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-2">Email address</span>
              <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/15 transition"/>
            </label>
            {!isForgot && (
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-2">Password</span>
                <input required minLength={8} type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="w-full h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/15 transition"/>
              </label>
            )}
            {!isSignup && !isForgot && <div className="text-right -mt-1"><Link href="/forgot-password" className="text-xs text-accent-primary hover:underline">Forgot password?</Link></div>}
            {error && <p role="alert" className="rounded-xl border border-error-border bg-error-bg px-3 py-2.5 text-xs leading-5 text-error-text">{error}</p>}
            {message && <p role="status" className="rounded-xl border border-success-border bg-success-bg px-3 py-2.5 text-xs leading-5 text-success-text">{message}</p>}
            <button disabled={busy} type="submit" className="w-full h-12 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {busy ? "Please wait…" : isSignup ? "Create account" : isForgot ? "Send reset link" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-text-secondary mt-7">
            {isForgot ? <Link href="/login" className="font-semibold text-accent-primary hover:underline">Back to sign in</Link> : isSignup ? <>Already have an account? <Link href="/login" className="font-semibold text-accent-primary hover:underline">Sign in</Link></> : <>New to SocraticAI? <Link href="/signup" className="font-semibold text-accent-primary hover:underline">Create an account</Link></>}
          </p>
        </section>
        <p className="text-center text-[11px] text-text-muted mt-6">Learn at your pace. Understand it for real.</p>
      </div>
    </main>
  );
}
