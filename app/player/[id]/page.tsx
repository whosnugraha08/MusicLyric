'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Song, SyncedLine } from '@/lib/types';
import AudioPlayer, { type AudioPlayerHandle } from '@/components/AudioPlayer';
import LyricDisplay from '@/components/LyricDisplay';
import DynamicBackground from '@/components/DynamicBackground';

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // ── Data ──────────────────────────────────────────────────
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Player state ──────────────────────────────────────────
  const playerRef = useRef<AudioPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lyricMode, setLyricMode] = useState<'line' | 'word'>('word');

  // ── Layout & presentation ─────────────────────────────────
  const [layout, setLayout] = useState<'landscape' | 'portrait'>('landscape');
  const [presentation, setPresentation] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setSong(data as Song);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Gagal memuat lagu');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params.id]);

  // ── Presentation‑mode mouse auto‑hide ─────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (presentation) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2000);
    }
  }, [presentation]);

  useEffect(() => {
    if (presentation) {
      showControls();
      window.addEventListener('mousemove', showControls);
      window.addEventListener('mousedown', showControls);
      return () => {
        window.removeEventListener('mousemove', showControls);
        window.removeEventListener('mousedown', showControls);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      };
    } else {
      setControlsVisible(true);
    }
  }, [presentation, showControls]);

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (playerRef.current?.isPlaying()) {
            playerRef.current.pause();
          } else {
            playerRef.current?.play();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          playerRef.current?.seek(Math.max(0, (playerRef.current?.getCurrentTime() ?? 0) - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          playerRef.current?.seek((playerRef.current?.getCurrentTime() ?? 0) + 5);
          break;
        case 'Escape':
          if (presentation) {
            setPresentation(false);
            if (document.fullscreenElement) document.exitFullscreen?.();
          }
          break;
        case 'KeyF':
          if (presentation) {
            if (document.fullscreenElement) {
              document.exitFullscreen?.();
            } else {
              document.documentElement.requestFullscreen?.();
            }
          }
          break;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentation]);

  // ── Toggle presentation ───────────────────────────────────
  const togglePresentation = async () => {
    if (!presentation) {
      setPresentation(true);
      try {
        await document.documentElement.requestFullscreen();
      } catch { /* might not be supported */ }
    } else {
      setPresentation(false);
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      }
    }
  };

  // ── Loading / error ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#050508]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Memuat lagu…</p>
        </div>
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#050508]">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-4">
          <div className="text-4xl">😵</div>
          <h2 className="text-xl font-semibold text-white">Gagal Memuat</h2>
          <p className="text-white/50">{error ?? 'Lagu tidak ditemukan'}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── No synced lyrics ──────────────────────────────────────
  if (!song.synced_lyrics || song.synced_lyrics.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#050508]">
        <DynamicBackground coverUrl={song.cover_url} />
        <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-4 z-10">
          <div className="text-5xl">🎵</div>
          <h2 className="text-xl font-semibold text-white">{song.title}</h2>
          <p className="text-white/50">Lagu belum disinkronkan</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/dashboard/songs/${song.id}/tap-sync`)}
              className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
            >
              Sinkronkan Sekarang
            </button>
            <button
              onClick={() => router.back()}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    );
  }

  const syncedLines: SyncedLine[] = song.synced_lyrics;
  const isLandscape = layout === 'landscape';

  const togglePlay = () => {
    if (playerRef.current?.isPlaying()) {
      playerRef.current.pause();
    } else {
      playerRef.current?.play();
    }
  };

  const skipBackward = () => {
    playerRef.current?.seek(Math.max(0, (playerRef.current?.getCurrentTime() ?? 0) - 10));
  };

  const skipForward = () => {
    playerRef.current?.seek((playerRef.current?.getCurrentTime() ?? 0) + 10);
  };

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 overflow-hidden select-none bg-[#050508]">
      {/* ── Background ──────────────────────────────────────── */}
      <DynamicBackground coverUrl={song.cover_url} />

      {/* ── Top controls bar ────────────────────────────────── */}
      <div
        className={`absolute top-0 inset-x-0 z-40 flex items-center justify-between px-4 sm:px-6 h-14 transition-all duration-500 ${
          presentation && !controlsVisible
            ? 'opacity-0 -translate-y-4 pointer-events-none'
            : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Kembali</span>
        </button>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Lyric mode toggle */}
          <button
            onClick={() => setLyricMode(m => m === 'word' ? 'line' : 'word')}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-all"
            title={lyricMode === 'word' ? 'Mode: Per Kata' : 'Mode: Per Baris'}
          >
            {lyricMode === 'word' ? 'Kata' : 'Baris'}
          </button>

          {/* Layout toggle */}
          <button
            onClick={() => setLayout(l => l === 'landscape' ? 'portrait' : 'landscape')}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-all"
            title={isLandscape ? '16:9 Landscape' : '9:16 Portrait'}
          >
            {isLandscape ? '16:9' : '9:16'}
          </button>

          {/* Presentation toggle */}
          <button
            onClick={togglePresentation}
            className="flex items-center justify-center h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all"
            title={presentation ? 'Keluar Presentasi' : 'Mode Presentasi'}
          >
            {presentation ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────── */}
      <main
        className={`absolute inset-0 pt-14 flex transition-all duration-500 ${
          isLandscape
            ? 'flex-row max-w-7xl mx-auto w-full'
            : 'flex-col items-center'
        }`}
      >
        {/* ── Left panel: Cover + Info + Controls ────────── */}
        <div
          className={`flex-shrink-0 flex flex-col items-center justify-center ${
            isLandscape
              ? 'w-[38%] max-w-md p-6 lg:p-10 gap-5'
              : 'w-full pt-3 pb-2 px-6 gap-3'
          }`}
        >
          {/* Cover Art */}
          {song.cover_url && (
            <div className="relative group flex-shrink-0">
              {/* Glow behind cover */}
              <div
                className="absolute -inset-6 rounded-3xl opacity-40 blur-3xl transition-opacity group-hover:opacity-60"
                style={{
                  background: `conic-gradient(from 0deg, var(--primary), var(--accent), var(--primary))`,
                }}
              />
              <img
                src={song.cover_url}
                alt={`${song.title} cover`}
                className={`relative rounded-2xl shadow-2xl object-cover ${
                  isLandscape
                    ? 'w-full max-w-[280px] aspect-square'
                    : 'w-40 h-40 sm:w-48 sm:h-48'
                }`}
              />
            </div>
          )}

          {/* Title & Artist */}
          <div className={`text-center w-full max-w-[280px] ${isLandscape ? '' : 'mt-1'}`}>
            <h2 className="text-base sm:text-lg font-bold text-white truncate">{song.title}</h2>
            <p className="text-sm text-white/50 truncate">{song.artist}</p>
          </div>

          {/* Progress bar */}
          {song.audio_url && (
            <div className="w-full max-w-[280px] space-y-1.5">
              {/* Clickable progress track */}
              <div
                className="group relative h-1 w-full cursor-pointer rounded-full overflow-hidden transition-all hover:h-1.5"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const newTime = ratio * duration;
                  playerRef.current?.seek(newTime);
                }}
              >
                <div className="absolute inset-0 bg-white/10 rounded-full" />
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-400 to-accent-400 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
                {/* Knob */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow-lg shadow-primary-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress}% - 6px)` }}
                />
              </div>
              {/* Time labels */}
              <div className="flex justify-between text-[10px] text-white/40 font-mono tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          )}

          {/* Play controls */}
          {song.audio_url && (
            <div className="flex items-center gap-6">
              {/* Skip backward 10s */}
              <button
                onClick={skipBackward}
                className="text-white/50 hover:text-white transition-colors active:scale-90"
                title="Mundur 10 detik"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4v6h6" />
                  <path d="M3.51 15a9 9 0 105.64-12.36L3 9" />
                </svg>
              </button>

              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="flex items-center justify-center h-12 w-12 rounded-full bg-white text-black hover:scale-105 transition-all active:scale-95 shadow-lg"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="3" width="5" height="18" rx="1" />
                    <rect x="14" y="3" width="5" height="18" rx="1" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 3.5v17a1 1 0 001.5.86l14-8.5a1 1 0 000-1.72l-14-8.5A1 1 0 006 3.5z" />
                  </svg>
                )}
              </button>

              {/* Skip forward 10s */}
              <button
                onClick={skipForward}
                className="text-white/50 hover:text-white transition-colors active:scale-90"
                title="Maju 10 detik"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6" />
                  <path d="M20.49 15a9 9 0 11-5.64-12.36L21 9" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ── Right panel: Lyrics ────────────────────────── */}
        <div
          className={`flex-1 min-h-0 min-w-0 ${
            isLandscape ? 'h-full' : 'flex-1 w-full'
          }`}
        >
          <LyricDisplay
            syncedLyrics={syncedLines}
            currentTime={currentTime}
            mode={lyricMode}
            onSeek={(time) => {
              playerRef.current?.seek(time);
              if (!playerRef.current?.isPlaying()) {
                playerRef.current?.play();
              }
            }}
          />
        </div>
      </main>

      {/* ── Hidden audio element (no bottom bar) ──────────── */}
      {song.audio_url && (
        <AudioPlayer
          ref={playerRef}
          src={song.audio_url}
          title={song.title}
          artist={song.artist}
          onTimeUpdate={(t) => {
            setCurrentTime(t);
            setPlaying(playerRef.current?.isPlaying() ?? false);
          }}
          onDurationChange={setDuration}
          className="hidden-player"
        />
      )}
    </div>
  );
}
