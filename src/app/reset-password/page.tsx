"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login?reset=success");
  }

  return <main className="min-h-screen bg-background text-text-primary flex items-center justify-center px-4 py-10"><section className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-xl"><Link href="/login" className="text-sm text-accent-primary">← SocraticAI</Link><h1 className="mt-7 text-3xl font-semibold">Choose a new password</h1><p className="mt-2 mb-7 text-sm text-text-secondary">Use at least 8 characters.</p><form onSubmit={submit} className="space-y-4"><input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder="New password" className="w-full h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent-primary"/>{error && <p role="alert" className="text-sm text-error-text">{error}</p>}<button disabled={busy} className="w-full h-12 rounded-xl bg-accent-primary text-white font-semibold disabled:opacity-60">{busy ? "Saving…" : "Update password"}</button></form></section></main>;
}
