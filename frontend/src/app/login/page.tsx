"use client";

import { LogIn, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          console.error("Signup Failed:", error);
          throw new Error(error.message);
        }
        setSuccessMessage("Sign-up successful. If email confirmation is enabled, check your inbox.");
      } else {
        console.log("Attempting Direct Login...");
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        console.log("Login Response:", { data, error });
        
        if (error) {
          console.error("Login Failed:", error);
          throw new Error(error.message);
        }
        
        console.log("Login Successful - User authenticated:", data.user?.id);
        console.log("Session:", data.session);
        
        // Wait for session to be established, then redirect
        console.log("Waiting for session establishment...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log("Redirecting to dashboard...");
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      console.error("Login form error:", error);
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
          <h1 className="text-3xl font-bold tracking-tight text-white">Welcome</h1>
          <p className="text-sm text-slate-300">Sign in or create your SparkOps account.</p>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-900/70 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === "login" ? "bg-emerald-600 text-white" : "text-slate-300"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === "signup" ? "bg-emerald-600 text-white" : "text-slate-300"
            }`}
          >
            Sign Up
          </button>
        </div>

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

          {successMessage ? (
            <p className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 p-3 text-sm text-emerald-100">{successMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {mode === "signup" ? "Create account" : "Sign In to SparkOps"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-slate-500">
          Status: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "Connected" : "Config Missing"}
        </div>
      </section>
    </main>
  );
}
