'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Song, SyncedLine, SyncedWord } from '@/lib/types';
import AudioPlayer, { type AudioPlayerHandle } from '@/components/AudioPlayer';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatTimeFull(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00.000';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function parseTimeInput(value: string): number | null {
  // Accept "MM:SS.mmm", "MM:SS.m", "M:SS", "SS.mmm", "SS"
  const parts = value.trim().split(':');
  let minutes = 0;
  let rest = '';

  if (parts.length === 2) {
    minutes = parseInt(parts[0], 10) || 0;
    rest = parts[1];
  } else if (parts.length === 1) {
    rest = parts[0];
  } else {
    return null;
  }

  const secParts = rest.split('.');
  const secs = parseInt(secParts[0], 10) || 0;

  let ms = 0;
  if (secParts.length === 2) {
    const msStr = secParts[1].padEnd(3, '0').slice(0, 3);
    ms = parseInt(msStr, 10) || 0;
  }

  return minutes * 60 + secs + ms / 1000;
}

// ────────────────────────────────────────────────────────────
// Editable line type
// ────────────────────────────────────────────────────────────

interface EditableLine {
  text: string;
  startInput: string;
  endInput: string;
  words: SyncedWord[];
  lineIndex: number;
}

function syncedLinesToEditable(lines: SyncedLine[]): EditableLine[] {
  return lines.map((line, i) => ({
    text: line.text,
    startInput: formatTimeFull(line.start),
    endInput: formatTimeFull(line.end),
    words: line.words,
    lineIndex: i,
  }));
}

function editableToSyncedLines(editable: EditableLine[]): SyncedLine[] {
  return editable.map((line, i) => {
    const start = parseTimeInput(line.startInput) ?? 0;
    const end = parseTimeInput(line.endInput) ?? start + 3;

    // Reconstruct words with updated line-level timings
    const words: SyncedWord[] =
      line.words.length > 0
        ? line.words.map(w => ({
            ...w,
            line_index: i,
            // If it's a single-word line (from tap-sync), update word timing to match line timing
            ...(line.words.length === 1 ? { start, end } : {}),
          }))
        : [
            {
              word: line.text,
              start,
              end,
              line_index: i,
            },
          ];

    return {
      text: line.text,
      start,
      end,
      words,
    };
  });
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function EditSyncPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // ── Data ──────────────────────────────────────────────────
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Editor state ──────────────────────────────────────────
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const playerRef = useRef<AudioPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);

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

        if (s.synced_lyrics && s.synced_lyrics.length > 0) {
          setLines(syncedLinesToEditable(s.synced_lyrics));
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Gagal memuat lagu');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  // ── Update a line's time field ────────────────────────────
  const updateLineField = useCallback(
    (index: number, field: 'startInput' | 'endInput', value: string) => {
      setLines(prev => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
      setDirty(true);
    },
    [],
  );

  // ── Play from specific line ───────────────────────────────
  const playFrom = useCallback(
    (index: number) => {
      const line = lines[index];
      if (!line) return;
      const time = parseTimeInput(line.startInput) ?? 0;
      playerRef.current?.seek(time);
      playerRef.current?.play();
      setActiveLine(index);
    },
    [lines],
  );

  // ── Set current time as start ─────────────────────────────
  const setStartToCurrent = useCallback(
    (index: number) => {
      updateLineField(index, 'startInput', formatTimeFull(currentTime));
    },
    [currentTime, updateLineField],
  );

  // ── Set current time as end ───────────────────────────────
  const setEndToCurrent = useCallback(
    (index: number) => {
      updateLineField(index, 'endInput', formatTimeFull(currentTime));
    },
    [currentTime, updateLineField],
  );

  // ── Auto-highlight active line based on playback ──────────
  useEffect(() => {
    if (lines.length === 0) return;
    let idx: number | null = null;
    for (let i = 0; i < lines.length; i++) {
      const start = parseTimeInput(lines[i].startInput) ?? 0;
      const end = parseTimeInput(lines[i].endInput) ?? 0;
      if (currentTime >= start && currentTime < end) {
        idx = i;
        break;
      }
    }
    setActiveLine(idx);
  }, [currentTime, lines]);

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!song) return;
    setSaving(true);

    try {
      const syncedLyrics = editableToSyncedLines(lines);

      const { error: err } = await supabase
        .from('songs')
        .update({
          synced_lyrics: syncedLyrics,
          sync_status: 'synced',
          updated_at: new Date().toISOString(),
        })
        .eq('id', song.id);

      if (err) throw err;
      setDirty(false);
      alert('Perubahan berhasil disimpan!');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

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

  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b]">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-4">
          <div className="text-5xl">🎵</div>
          <h2 className="text-xl font-semibold text-white">Belum Ada Sinkronisasi</h2>
          <p className="text-white/50">Sinkronkan lirik terlebih dahulu menggunakan Tap-to-Sync.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/dashboard/songs/${song.id}/tap-sync`)}
              className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
            >
              Mulai Tap-to-Sync
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

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="glass-strong sticky top-0 z-30 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (dirty && !confirm('Ada perubahan yang belum disimpan. Yakin ingin keluar?')) return;
                router.back();
              }}
              className="flex items-center justify-center h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-sm font-semibold truncate max-w-[200px] sm:max-w-none">{song.title}</h1>
              <p className="text-xs text-white/40">Edit Sinkronisasi</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Re-sync manual */}
            <button
              onClick={() => router.push(`/dashboard/songs/${song.id}/tap-sync`)}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-all"
            >
              ↺ Re-sync Manual
            </button>
            {/* Cancel */}
            <button
              onClick={() => {
                if (dirty && !confirm('Buang semua perubahan?')) return;
                if (song.synced_lyrics) {
                  setLines(syncedLinesToEditable(song.synced_lyrics));
                  setDirty(false);
                }
              }}
              disabled={!dirty}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              Batal
            </button>
            {/* Save */}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Current time indicator ──────────────────────────── */}
      <div className="px-4 sm:px-6 pt-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="glass rounded-lg px-3 py-1.5 text-xs text-white/50">
            Posisi: <span className="text-primary-300 font-mono tabular-nums">{formatTimeFull(currentTime)}</span>
          </div>
          <div className="text-xs text-white/30">
            {lines.length} baris
          </div>
        </div>
      </div>

      {/* ── Timeline editor ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 pb-24">
        <div className="max-w-5xl mx-auto space-y-1">
          {lines.map((line, i) => {
            const isActive = i === activeLine;

            return (
              <div
                key={i}
                className={`group flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-500/15 border border-primary-500/30'
                    : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04] hover:border-white/5'
                }`}
              >
                {/* Line number */}
                <span className={`flex-shrink-0 w-7 text-right text-xs font-mono tabular-nums ${
                  isActive ? 'text-primary-400' : 'text-white/20'
                }`}>
                  {i + 1}
                </span>

                {/* Lyric text */}
                <span className={`flex-1 min-w-0 text-sm truncate ${
                  isActive ? 'text-white font-medium' : 'text-white/60'
                }`}>
                  {line.text}
                </span>

                {/* Start time input */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => setStartToCurrent(i)}
                    className="h-7 w-7 rounded-lg bg-white/5 hover:bg-primary-500/30 text-white/30 hover:text-primary-300 text-[10px] font-bold flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                    title="Set start ke posisi saat ini"
                  >
                    S
                  </button>
                  <input
                    type="text"
                    value={line.startInput}
                    onChange={e => updateLineField(i, 'startInput', e.target.value)}
                    className="glass-input w-[100px] sm:w-[110px] px-2 py-1.5 rounded-lg text-xs font-mono tabular-nums text-center text-white/80 focus:text-white"
                    placeholder="00:00.000"
                  />
                </div>

                {/* Separator */}
                <span className="text-white/15 text-xs">→</span>

                {/* End time input */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  <input
                    type="text"
                    value={line.endInput}
                    onChange={e => updateLineField(i, 'endInput', e.target.value)}
                    className="glass-input w-[100px] sm:w-[110px] px-2 py-1.5 rounded-lg text-xs font-mono tabular-nums text-center text-white/80 focus:text-white"
                    placeholder="00:00.000"
                  />
                  <button
                    onClick={() => setEndToCurrent(i)}
                    className="h-7 w-7 rounded-lg bg-white/5 hover:bg-accent-500/30 text-white/30 hover:text-accent-300 text-[10px] font-bold flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                    title="Set end ke posisi saat ini"
                  >
                    E
                  </button>
                </div>

                {/* Play from here */}
                <button
                  onClick={() => playFrom(i)}
                  className={`flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-primary-500/30 text-primary-300'
                      : 'bg-white/5 hover:bg-white/10 text-white/30 hover:text-white/70'
                  }`}
                  title="Play dari sini"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 3.5v17a1 1 0 001.5.86l14-8.5a1 1 0 000-1.72l-14-8.5A1 1 0 006 3.5z" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Audio player ────────────────────────────────────── */}
      {song.audio_url && (
        <AudioPlayer
          ref={playerRef}
          src={song.audio_url}
          title={song.title}
          artist={song.artist}
          onTimeUpdate={setCurrentTime}
        />
      )}
    </div>
  );
}
