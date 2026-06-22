'use client';

import { useEffect, useState } from 'react';
import type { ExtractedColors } from '@/lib/types';

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface DynamicBackgroundProps {
  coverUrl?: string | null;
  colors?: { primary: string; secondary: string; accent: string };
  /** Additional className for the wrapper. */
  className?: string;
}

// ────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────

const DEFAULT_PALETTE = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  accent: '#7e22ce',
};

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function DynamicBackground({
  coverUrl,
  colors: overrideColors,
  className,
}: DynamicBackgroundProps) {
  const [palette, setPalette] = useState(overrideColors ?? DEFAULT_PALETTE);

  // ── Colour extraction ─────────────────────────────────────
  useEffect(() => {
    if (overrideColors) {
      setPalette(overrideColors);
      return;
    }

    if (!coverUrl) {
      setPalette(DEFAULT_PALETTE);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Dynamic import keeps the server-side Vibrant dep from bundling unnecessarily
        const { extractColors } = await import('@/lib/color-extract');
        const extracted: ExtractedColors = await extractColors(coverUrl);
        if (!cancelled) {
          setPalette({
            primary: extracted.primary,
            secondary: extracted.secondary,
            accent: extracted.accent,
          });
        }
      } catch {
        if (!cancelled) setPalette(DEFAULT_PALETTE);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coverUrl, overrideColors]);

  const { primary, secondary, accent } = palette;

  return (
    <div
      className={`fixed inset-0 -z-10 overflow-hidden ${className ?? ''}`}
      aria-hidden="true"
    >
      {/* ── Layer 1: Base dark fill ────────────────────────────── */}
      <div className="absolute inset-0 bg-[#050508]" />

      {/* ── Layer 2: Primary radial gradient (top-left) ────────── */}
      <div
        className="absolute -inset-1/4 animate-gradient-shift"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 20% 30%, ${primary}66 0%, transparent 70%)`,
          backgroundSize: '200% 200%',
        }}
      />

      {/* ── Layer 3: Secondary radial gradient (bottom-right) ──── */}
      <div
        className="absolute -inset-1/4"
        style={{
          background: `radial-gradient(ellipse 70% 70% at 80% 70%, ${secondary}55 0%, transparent 70%)`,
          animation: 'gradient-shift 12s ease-in-out infinite reverse',
          backgroundSize: '200% 200%',
        }}
      />

      {/* ── Layer 4: Accent splash (center‑bottom) ─────────────── */}
      <div
        className="absolute -inset-1/4"
        style={{
          background: `radial-gradient(ellipse 50% 50% at 50% 80%, ${accent}33 0%, transparent 60%)`,
          animation: 'gradient-shift 16s ease-in-out infinite',
          backgroundSize: '200% 200%',
        }}
      />

      {/* ── Layer 5: Subtle vignette ──────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, #050508 100%)',
        }}
      />

      {/* ── Layer 6: Noise / grain texture overlay ────────────── */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />
    </div>
  );
}
