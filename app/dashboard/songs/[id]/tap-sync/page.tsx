'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Song, SyncedLine, SyncedWord } from '@/lib/types';
import AudioPlayer, { type AudioPlayerHandle } from '@/components/AudioPlayer';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface LineTimestamp {
  text: string;
  start: number | null;
  end: number | null;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

function convertToSyncedLyrics(lines: LineTimestamp[]): SyncedLine[] {
  return lines.map((line, lineIndex) => {
    const start = line.start ?? 0;
    const end = line.end ?? start + 3;

    const word: SyncedWord = {
      word: line.text,
      start,
      end,
      line_index: lineIndex,
    };

    return {
      text: line.text,
      start,
      end,
      words: [word],
    };
  });
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function TapSyncPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // ── Data ──────────────────────────────────────────────────
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Sync state ────────────────────────────────────────────
  const [lines, setLines] = useState<LineTimestamp[]>([]);
  const [currentTarget, setCurrentTarget] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<AudioPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const lineListRef = useRef<HTMLDivElement>(null);

  // ── Fetch song ────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { data, error: err } = await supabase
          .from('songs')
          .select('*')
          .eq('id', params.id)
          .single();

        if (err) throw err;
        const s = data as Song;
        setSong(s);

        // Parse raw lyrics into lines
        if (s.raw_lyrics) {
          const parsed = s.raw_lyrics
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .map(text => ({ text, start: null, end: null } as LineTimestamp));
          setLines(parsed);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Gagal memuat lagu');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  // ── Scroll active line into view ──────────────────────────
  useEffect(() => {
    const el = document.getElementById(`tap-line-${currentTarget}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentTarget]);

  // ── Tap handler ───────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (currentTarget >= lines.length) return;

    const time = playerRef.current?.getCurrentTime() ?? 0;

    setLines(prev => {
      const next = [...prev];

      // Set start of current line
      next[currentTarget] = { ...next[currentTarget], start: time };

      // Set end of previous line
      if (currentTarget > 0 && next[currentTarget - 1].end === null) {
        next[currentTarget - 1] = { ...next[currentTarget - 1], end: time };
      }

      // If this is the last line, set its end
      if (currentTarget === lines.length - 1) {
        const endTime = duration > 0 ? Math.min(time + 3, duration) : time + 3;
        next[currentTarget] = { ...next[currentTarget], end: endTime };
      }

      return next;
    });

    setCurrentTarget(prev => Math.min(prev + 1, lines.length));
  }, [currentTarget, lines.length, duration]);

  // ── Undo ──────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (currentTarget <= 0) return;

    const undoIndex = currentTarget >= lines.length ? lines.length - 1 : currentTarget - 1;

    setLines(prev => {
      const next = [...prev];
      next[undoIndex] = { ...next[undoIndex], start: null, end: null };
      if (undoIndex > 0) {
        next[undoIndex - 1] = { ...next[undoIndex - 1], end: null };
      }
      return next;
    });

    setCurrentTarget(prev => Math.max(0, prev - 1));
  }, [currentTarget, lines.length]);

  // ── Restart ───────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    setLines(prev => prev.map(l => ({ ...l, start: null, end: null })));
    setCurrentTarget(0);
    playerRef.current?.seek(0);
    playerRef.current?.pause();
  }, []);

  // ── Keyboard listener ─────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTap();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleTap]);

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!song) return;
    setSaving(true);

    try {
      const syncedLyrics = convertToSyncedLyrics(lines);

      const { error: err } = await supabase
        .from('songs')
        .update({
          synced_lyrics: syncedLyrics,
          sync_status: 'synced',
          updated_at: new Date().toISOString(),
        })
        .eq('id', song.id);

      if (err) throw err;
      setSaved(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const isComplete = currentTarget >= lines.length;
  const markedCount = lines.filter(l => l.start !== null).length;

  // ── Loading / error ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Memuat lagu…</p>
        </div>
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b]">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-4">
          <div className="text-4xl">😵</div>
          <h2 className="text-xl font-semibold text-white">Error</h2>
          <p className="text-white/50">{error ?? 'Lagu tidak ditemukan'}</p>
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  if (!song.raw_lyrics || lines.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b]">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-4">
          <div className="text-5xl">📝</div>
          <h2 className="text-xl font-semibold text-white">Tidak Ada Lirik</h2>
          <p className="text-white/50">Tambahkan lirik terlebih dahulu sebelum sinkronisasi.</p>
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────
  if (saved) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b]">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-6">
          <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
            <div className="relative w-16 h-16 rounded-full bg-green-500/30 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Sinkronisasi Berhasil!</h2>
            <p className="text-white/50 mt-1">{lines.length} baris telah ditandai</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/player/${song.id}`)}
              className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
            >
              ▶ Preview di Player
            </button>
            <button
              onClick={() => router.push(`/dashboard/songs/${song.id}/edit-sync`)}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              Edit Timing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="glass-strong sticky top-0 z-30 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-sm font-semibold truncate max-w-[200px] sm:max-w-none">{song.title}</h1>
              <p className="text-xs text-white/40">Tap-to-Sync</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/50 font-mono tabular-nums">
              {markedCount}/{lines.length} baris
            </span>
            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden hidden sm:block">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-accent-400 rounded-full transition-all duration-300"
                style={{ width: `${(markedCount / lines.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── Audio player area ───────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-4">
        <div className="max-w-4xl mx-auto">
          {/* Current time display */}
          <div className="text-center mb-3">
            <span className="text-3xl font-mono font-bold tabular-nums text-primary-400">
              {formatTime(currentTime)}
            </span>
          </div>

          {/* Instructions */}
          <div className="glass rounded-xl px-4 py-3 text-center text-sm text-white/60 mb-4">
            <span className="text-primary-300">SPASI</span> atau klik tombol saat baris berikutnya mulai dinyanyikan
          </div>
        </div>
      </div>

      {/* ── Lyric lines ─────────────────────────────────────── */}
      <div ref={lineListRef} className="flex-1 overflow-y-auto px-4 sm:px-6 pb-52">
        <div className="max-w-4xl mx-auto space-y-1">
          {lines.map((line, i) => {
            const isTarget = i === currentTarget;
            const isMarked = line.start !== null;
            const isPast = i < currentTarget;

            return (
              <div
                key={i}
                id={`tap-line-${i}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isTarget
                    ? 'bg-primary-500/20 border border-primary-500/40 scale-[1.01]'
                    : isPast && isMarked
                      ? 'bg-green-500/10 border border-green-500/20'
                      : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                {/* Line number */}
                <span className={`flex-shrink-0 w-7 text-right text-xs font-mono tabular-nums ${
                  isTarget ? 'text-primary-400' : isPast ? 'text-green-400/60' : 'text-white/20'
                }`}>
                  {i + 1}
                </span>

                {/* Status icon */}
                <span className="flex-shrink-0 w-5 text-center">
                  {isMarked ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : isTarget ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
                  ) : (
                    <span className="inline-block w-2 h-2 rounded-full bg-white/10" />
                  )}
                </span>

                {/* Text */}
                <span className={`flex-1 text-sm sm:text-base transition-colors ${
                  isTarget
                    ? 'text-white font-semibold'
                    : isMarked
                      ? 'text-white/60'
                      : 'text-white/30'
                }`}>
                  {line.text}
                </span>

                {/* Timestamp */}
                {isMarked && (
                  <span className="flex-shrink-0 text-xs font-mono tabular-nums text-green-400/60">
                    {formatTime(line.start!)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom action bar ───────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-40 lg:pl-64">
        {/* Player */}
        {song.audio_url && (
          <AudioPlayer
            ref={playerRef}
            src={song.audio_url}
            title={song.title}
            artist={song.artist}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setDuration}
            className="lg:pl-64"
          />
        )}

        {/* Action buttons — sits above the player bar */}
        <div className="glass-strong border-t border-white/5 px-4 sm:px-6 py-3 mb-[52px]">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* Restart */}
              <button
                onClick={handleRestart}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-all"
              >
                ↺ Ulang
              </button>
              {/* Undo */}
              <button
                onClick={handleUndo}
                disabled={currentTarget <= 0}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                ← Undo
              </button>
            </div>

            {/* Tap / Save button */}
            {isComplete ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Menyimpan…' : '✓ Simpan Sinkronisasi'}
              </button>
            ) : (
              <button
                onClick={handleTap}
                className="px-8 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-all active:scale-95 animate-pulse-glow"
              >
                ⏎ Tandai Baris {currentTarget + 1}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
