"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AudioLines, LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { login, signup } from "./actions";

type AuthMode = "login" | "signup";

function LoginPageContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const initialMode: AuthMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_52%,#020617_100%)] p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-amber-500/20 bg-slate-900/70 p-8 shadow-2xl shadow-black/60 backdrop-blur-xl">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.button
              type="button"
              aria-label="SparkOps secure audio lock"
              className="mx-auto mb-4 inline-flex min-h-14 min-w-14 items-center justify-center rounded-full border border-amber-500/60 bg-amber-500/20 text-amber-200 shadow-[0_0_35px_rgba(245,158,11,0.28)]"
              animate={reduceMotion ? undefined : { scale: [1, 1.07, 1] }}
              transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <AudioLines className="h-6 w-6" />
            </motion.button>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/80 mb-4 border border-slate-700/80">
              <LogIn className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">SPARKOPS SECURE ACCESS</h1>
            <p className="text-slate-300">Welcome</p>
            <p className="text-slate-500 text-sm mt-1">Sign in or create your SparkOps account.</p>
          </div>

          {/* Mode Toggle */}
          <div className="mb-6 flex rounded-xl border border-slate-700/70 bg-slate-800/50 p-1">
            <button
              onClick={() => setMode("login")}
              className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-amber-500 text-slate-950 shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                mode === "signup"
                  ? "bg-amber-500 text-slate-950 shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Login Form */}
          {mode === "login" ? (
            <form action={login} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-400 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-400 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="min-h-11 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-3 font-semibold text-slate-950 transition-all hover:from-amber-400 hover:to-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sign In to SparkOps
              </button>
            </form>
          ) : (
            <form action={signup} className="space-y-4">
              <div>
                <label htmlFor="signup-full-name" className="block text-sm font-medium text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  id="signup-full-name"
                  name="full_name"
                  type="text"
                  required
                  className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-400 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="Hemi Ropata"
                />
              </div>

              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-400 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="signup-organization" className="block text-sm font-medium text-slate-300 mb-2">
                  Organization
                </label>
                <input
                  id="signup-organization"
                  name="organization"
                  type="text"
                  required
                  className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-400 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="Spark Electrical Ltd"
                />
              </div>

              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-400 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="min-h-11 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-3 font-semibold text-slate-950 transition-all hover:from-amber-400 hover:to-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create Account
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-slate-500 text-sm">
              Status: <span className="text-green-400 font-medium">Connected</span>
            </p>
            <div className="mt-3 text-xs text-slate-400">
              <Link href="/" className="hover:text-white">Back to home</Link>
              <span className="mx-2">•</span>
              <Link href="/signup" className="hover:text-white">Create account</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginPageContent />
    </Suspense>
  );
}