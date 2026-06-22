'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        router.push('/dashboard');
      } else {
        setError(data.error || 'Authentication failed');
        setPassword('');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 animate-gradient-shift bg-[length:400%_400%]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 30% 40%, rgba(147,51,234,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(6,182,212,0.08) 0%, transparent 60%), linear-gradient(180deg, #09090b 0%, #0f0f14 100%)',
        }}
      />

      {/* Ambient glow orbs */}
      <div className="absolute left-1/4 top-1/3 h-72 w-72 rounded-full bg-primary-600/10 blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/3 h-64 w-64 rounded-full bg-accent-500/8 blur-[80px]" />

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="glass-card rounded-2xl p-8 sm:p-10">
          {/* Logo */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="gradient-text">Lyric</span>
              <span className="text-white">Stage</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Masuk ke studio Anda
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password admin"
                required
                autoFocus
                className="glass-input w-full rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-600 outline-none"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="animate-slide-up rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !password}
              className="btn-glow relative w-full rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-lg disabled:hover:shadow-primary-500/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Authenticating...
                </span>
              ) : (
                'Masuk'
              )}
            </button>
          </form>

          {/* Bottom accent line */}
          <div className="mt-8 flex justify-center">
            <div className="h-1 w-16 rounded-full bg-gradient-to-r from-primary-500/50 to-accent-400/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
