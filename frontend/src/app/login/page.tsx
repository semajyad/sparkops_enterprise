"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { login, signup } from "./actions";

type AuthMode = "login" | "signup";

function LoginPageContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const initialMode: AuthMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const authMessage = searchParams.get("message");
  const authError = searchParams.get("error");
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              animate={reduceMotion ? undefined : { opacity: [0.9, 1, 0.9] }}
              transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <h1 className="text-4xl font-black tracking-tighter text-gray-900">TradeOps</h1>
            </motion.div>
            <p className="text-gray-700">Welcome</p>
            <p className="mt-1 text-sm text-gray-500">Sign in or create your TradeOps account.</p>
          </div>

          {/* Mode Toggle */}
          <div className="mb-6 flex rounded-xl border border-gray-300 bg-gray-100 p-1">
            <button
              onClick={() => setMode("login")}
              className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-orange-600"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                mode === "signup"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-orange-600"
              }`}
            >
              Sign Up
            </button>
          </div>

          {authMessage && authMessage !== "Logged out" ? (
            <p className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              {authMessage}
            </p>
          ) : null}

          {authError ? (
            <p className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {authError}
            </p>
          ) : null}

          {/* Login Form */}
          {mode === "login" ? (
            <form action={login} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="min-h-11 w-full rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white transition-all hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sign In to SparkOps
              </button>
            </form>
          ) : (
            <form action={signup} className="space-y-4">
              <div>
                <label htmlFor="signup-full-name" className="mb-2 block text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <input
                  id="signup-full-name"
                  name="full_name"
                  type="text"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="Hemi Ropata"
                />
              </div>

              <div>
                <label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="signup-organization" className="mb-2 block text-sm font-medium text-gray-700">
                  Organization
                </label>
                <input
                  id="signup-organization"
                  name="organization"
                  type="text"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="TradeOps Services Ltd"
                />
              </div>

              <div>
                <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="signup-trade" className="mb-2 block text-sm font-medium text-gray-700">
                  Trade
                </label>
                <select
                  id="signup-trade"
                  name="trade"
                  defaultValue="ELECTRICAL"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                >
                  <option value="ELECTRICAL">Electrician</option>
                  <option value="PLUMBING">Plumbing</option>
                </select>
              </div>

              <button
                type="submit"
                className="min-h-11 w-full rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white transition-all hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create Account
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Status: <span className="font-medium text-green-600">Connected</span>
            </p>
            <div className="mt-3 text-xs text-gray-500">
              <Link href="/" className="hover:text-orange-600">Back to home</Link>
              <span className="mx-2">•</span>
              <Link href="/signup" className="hover:text-orange-600">Create account</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <LoginPageContent />
    </Suspense>
  );
}