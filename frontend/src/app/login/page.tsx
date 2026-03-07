"use client";

import { LogIn, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      const redirectedFrom = searchParams.get("redirectedFrom");
      router.push(redirectedFrom || "/");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl shadow-slate-950/50">
        <header className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-300">SparkOps Secure Access</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Sign in</h1>
          <p className="text-sm text-slate-300">Use your SparkOps account to continue.</p>
        </header>

        <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="block space-y-2 text-sm text-slate-200" htmlFor="email">
            <span>Email</span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
              placeholder="name@company.com"
            />
          </label>

          <label className="block space-y-2 text-sm text-slate-200" htmlFor="password">
            <span>Password</span>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
              placeholder="••••••••"
            />
          </label>

          {errorMessage ? (
            <p className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-100">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
