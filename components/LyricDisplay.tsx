'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { SyncedLine, SyncedWord } from '@/lib/types';

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface LyricDisplayProps {
  /** Synced lines (grouped). */
  syncedLyrics: SyncedLine[];
  /** Current playback position in seconds. */
  currentTime: number;
  /** Highlight granularity. */
  mode: 'line' | 'word';
  className?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function getActiveLineIndex(lines: SyncedLine[], time: number): number {
  // Find the last line whose start <= time
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (time >= lines[i].start) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

function distanceOpacity(distance: number): number {
  if (distance === 0) return 1;
  if (Math.abs(distance) === 1) return 0.4;
  if (Math.abs(distance) === 2) return 0.22;
  return 0.12;
}

function distanceScale(distance: number): string {
  if (distance === 0) return 'scale(1.04)';
  if (Math.abs(distance) === 1) return 'scale(1)';
  return 'scale(0.97)';
}

function distanceBlur(distance: number): string {
  if (distance === 0) return 'blur(0px)';
  if (Math.abs(distance) <= 2) return 'blur(0px)';
  return 'blur(1px)';
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function LyricDisplay({
  syncedLyrics,
  currentTime,
  mode,
  className,
}: LyricDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastActiveRef = useRef(-1);

  const activeIndex = useMemo(
    () => getActiveLineIndex(syncedLyrics, currentTime),
    [syncedLyrics, currentTime],
  );

  // ── Auto‑scroll active line into center ────────────────────
  const scrollToActive = useCallback((index: number) => {
    const el = lineRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  useEffect(() => {
    if (activeIndex >= 0 && activeIndex !== lastActiveRef.current) {
      lastActiveRef.current = activeIndex;
      scrollToActive(activeIndex);
    }
  }, [activeIndex, scrollToActive]);

  // ── Ref callback ──────────────────────────────────────────
  const setLineRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (el) {
        lineRefs.current.set(index, el);
      } else {
        lineRefs.current.delete(index);
      }
    },
    [],
  );

  // ── No lyrics fallback ────────────────────────────────────
  if (!syncedLyrics || syncedLyrics.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${className ?? ''}`}>
        <p className="text-white/30 text-lg italic">Tidak ada lirik tersedia</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full overflow-y-auto hide-scrollbar py-[40vh] px-4 sm:px-8 ${className ?? ''}`}
    >
      <div className="flex flex-col items-center gap-6">
        {syncedLyrics.map((line, i) => {
          const dist = activeIndex >= 0 ? i - activeIndex : i;
          const isActive = i === activeIndex;
          const opacity = activeIndex < 0 ? 0.25 : distanceOpacity(dist);

          return (
            <div
              key={i}
              ref={setLineRef(i)}
              className="w-full max-w-2xl text-center transition-all duration-500 ease-out"
              style={{
                opacity,
                transform: distanceScale(dist),
                filter: distanceBlur(dist),
              }}
            >
              {mode === 'word' && isActive ? (
                /* ── Per-word highlighting ─────────────────── */
                <p className="text-2xl sm:text-3xl font-bold leading-relaxed">
                  {line.words.map((word, wi) => {
                    const isWordActive = currentTime >= word.start;
                    const isWordCurrent =
                      currentTime >= word.start && currentTime < word.end;
                    return (
                      <span
                        key={wi}
                        className={`inline-block mr-[0.3em] transition-all duration-200 ${
                          isWordCurrent
                            ? 'text-white text-glow-white scale-105'
                            : isWordActive
                              ? 'text-white/70'
                              : 'text-white/30'
                        }`}
                      >
                        {word.word}
                      </span>
                    );
                  })}
                </p>
              ) : (
                /* ── Line-level highlighting ──────────────── */
                <p
                  className={`leading-relaxed transition-all duration-500 ${
                    isActive
                      ? 'text-2xl sm:text-3xl font-bold text-white text-glow-white'
                      : 'text-lg sm:text-xl font-normal text-white'
                  }`}
                >
                  {line.text}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
