'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Song, SyncStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';

// ────────────────────────────────────────────────────────────
// Status Badge Config
// ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SyncStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  unsynced: {
    label: 'Belum Disinkron',
    className: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
  },
  processing: {
    label: 'Sedang Diproses',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    pulse: true,
  },
  synced: {
    label: 'Tersinkron',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
  needs_correction: {
    label: 'Perlu Koreksi',
    className: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  },
  failed: {
    label: 'Gagal',
    className: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
};

// ────────────────────────────────────────────────────────────
// Duration Formatter
// ────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ────────────────────────────────────────────────────────────
// Song Detail Page
// ────────────────────────────────────────────────────────────

export default function SongDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editLyrics, setEditLyrics] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // AI Sync
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Fetch Song ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchSong() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('songs')
        .select('*')
        .eq('id', id)
        .single();

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const songData = data as Song;
      setSong(songData);
      setEditTitle(songData.title);
      setEditArtist(songData.artist);
      setEditLyrics(songData.raw_lyrics ?? '');
      setLoading(false);
    }

    fetchSong();
    return () => { cancelled = true; };
  }, [id]);

  // ── Save Changes ───────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!song) return;
    setSaving(true);
    setSaveSuccess(false);

    const { error: updateError } = await supabase
      .from('songs')
      .update({
        title: editTitle.trim(),
        artist: editArtist.trim() || 'Unknown Artist',
        raw_lyrics: editLyrics.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', song.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSong((prev) =>
      prev
        ? {
            ...prev,
            title: editTitle.trim(),
            artist: editArtist.trim() || 'Unknown Artist',
            raw_lyrics: editLyrics.trim() || null,
          }
        : null
    );
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }, [song, editTitle, editArtist, editLyrics]);

  // ── Handle AI Sync ───────────────────────────────────────
  const handleAISync = async () => {
    if (!song) return;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.id }),
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error(`Server returned non-JSON response (${response.status}): ${text.slice(0, 150)}...`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync with AI');
      }

      // Success! Refetch song data
      const { data: newSongData, error } = await supabase
        .from('songs')
        .select('*')
        .eq('id', song.id)
        .single();
        
      if (!error && newSongData) {
        setSong(newSongData as Song);
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Handle Delete ────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!song) return;
    setDeleting(true);

    // Remove files from storage
    if (song.audio_url) {
      const audioPath = song.audio_url.split('/storage/v1/object/public/audio/').pop();
      if (audioPath) await supabase.storage.from('audio').remove([audioPath]);
    }
    if (song.cover_url) {
      const coverPath = song.cover_url.split('/storage/v1/object/public/covers/').pop();
      if (coverPath) await supabase.storage.from('covers').remove([coverPath]);
    }

    const { error: deleteError } = await supabase
      .from('songs')
      .delete()
      .eq('id', song.id);

    if (deleteError) {
      setDeleting(false);
      setError(deleteError.message);
      return;
    }

    router.push('/dashboard');
  }, [song, router]);

  const hasChanges =
    song &&
    (editTitle.trim() !== song.title ||
      (editArtist.trim() || 'Unknown Artist') !== song.artist ||
      (editLyrics.trim() || null) !== (song.raw_lyrics ?? null));

  const isSynced = song?.sync_status === 'synced';

  // ── Loading State ──────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse space-y-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="h-56 w-56 flex-shrink-0 rounded-2xl bg-white/[0.06]" />
          <div className="flex-1 space-y-4 py-2">
            <div className="h-8 w-3/4 rounded-lg bg-white/[0.06]" />
            <div className="h-5 w-1/2 rounded-lg bg-white/[0.04]" />
            <div className="h-6 w-28 rounded-full bg-white/[0.05]" />
            <div className="h-12 w-full rounded-xl bg-white/[0.04]" />
          </div>
        </div>
        <div className="h-64 rounded-2xl bg-white/[0.04]" />
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────
  if (error && !song) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <div className="glass-card rounded-2xl p-8 text-center max-w-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
            <svg className="h-7 w-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Lagu Tidak Ditemukan</h3>
          <p className="mt-2 text-sm text-gray-400">{error}</p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-xl bg-primary-500/20 px-5 py-2 text-sm font-medium text-primary-300 transition-colors hover:bg-primary-500/30"
          >
            Kembali ke Library
          </Link>
        </div>
      </div>
    );
  }

  if (!song) return null;

  const status = STATUS_CONFIG[song.sync_status];

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      {/* Hero Section */}
      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Cover Art */}
        <div className="relative h-56 w-56 flex-shrink-0 overflow-hidden rounded-2xl shadow-2xl shadow-black/40">
          {song.cover_url ? (
            <Image
              src={song.cover_url}
              alt={song.title}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900">
              <svg className="h-16 w-16 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
        </div>

        {/* Song Info */}
        <div className="flex flex-1 flex-col justify-center space-y-3">
          <h2 className="text-2xl font-bold text-white">{song.title}</h2>
          <p className="text-base text-gray-400">{song.artist}</p>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}
            >
              {status.pulse && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              )}
              {status.label}
            </span>

            {/* Duration */}
            {song.duration && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {formatDuration(song.duration)}
              </span>
            )}
          </div>

          {/* Audio Player */}
          {song.audio_url && (
            <div className="pt-2">
              <audio
                controls
                preload="metadata"
                className="w-full max-w-md rounded-lg [&::-webkit-media-controls-panel]:bg-surface-50"
                style={{ height: 40 }}
              >
                <source src={song.audio_url} />
              </audio>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex flex-wrap gap-3">
        {/* AI Sync */}
        <div className="group relative flex flex-col gap-1">
          <button
            onClick={handleAISync}
            disabled={isSyncing || !song?.audio_url || !song?.raw_lyrics}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isSyncing || !song?.audio_url || !song?.raw_lyrics
                ? 'cursor-not-allowed bg-white/[0.04] text-gray-500 opacity-60'
                : 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
            }`}
          >
            {isSyncing ? (
              <svg className="h-4 w-4 animate-spin text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 0-4 4v4h8V6a4 4 0 0 0-4-4z" />
                <rect x="3" y="10" width="18" height="12" rx="2" />
                <circle cx="12" cy="16" r="1" />
              </svg>
            )}
            {isSyncing ? 'Menyinkronkan...' : 'Sinkronkan dengan AI'}
          </button>
          
          {syncError && (
            <div className="text-xs text-red-400 mt-1 max-w-[200px] break-words">
              Error: {syncError}
            </div>
          )}
          
          {(!song?.audio_url || !song?.raw_lyrics) && (
            <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-100 px-3 py-1.5 text-[11px] text-gray-400 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-10">
              Butuh audio dan lirik mentah
            </div>
          )}
        </div>

        {/* Manual Tap-to-Sync */}
        <Link
          href={`/dashboard/songs/${song.id}/tap-sync`}
          className="flex items-center gap-2 rounded-xl bg-accent-500/15 px-4 py-2.5 text-sm font-medium text-accent-400 transition-colors hover:bg-accent-500/25"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          Manual Tap-to-Sync
        </Link>

        {/* Edit Sync (only if synced) */}
        {isSynced && (
          <Link
            href={`/dashboard/songs/${song.id}/edit-sync`}
            className="flex items-center gap-2 rounded-xl bg-primary-500/15 px-4 py-2.5 text-sm font-medium text-primary-400 transition-colors hover:bg-primary-500/25"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Sinkronisasi
          </Link>
        )}

        {/* Create Lyric Video (only if synced) */}
        {isSynced && (
          <Link
            href={`/player/${song.id}`}
            className="btn-glow flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all hover:shadow-primary-500/40"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Buat Lyric Video
          </Link>
        )}

        {/* Delete */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Hapus Lagu
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card mx-4 w-full max-w-sm rounded-2xl p-6 text-center animate-slide-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
              <svg className="h-7 w-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Hapus Lagu?</h3>
            <p className="mt-2 text-sm text-gray-400">
              <span className="font-medium text-white">{song.title}</span> akan dihapus secara permanen termasuk file audio dan cover.
            </p>
            <div className="mt-6 flex gap-3 justify-center">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editable Fields */}
      <div className="mt-10 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Edit Detail</h3>
          <div className="flex items-center gap-3">
            {/* Save success message */}
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 animate-fade-in">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Tersimpan
              </span>
            )}
            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`
                flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all
                ${
                  hasChanges
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25 hover:bg-primary-600'
                    : 'cursor-not-allowed bg-white/[0.04] text-gray-500'
                }
              `}
            >
              {saving ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  Menyimpan...
                </>
              ) : (
                'Simpan Perubahan'
              )}
            </button>
          </div>
        </div>

        {/* Error alert */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Title */}
        <div>
          <label htmlFor="edit-title" className="mb-2 block text-sm font-medium text-gray-300">
            Judul
          </label>
          <input
            id="edit-title"
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="glass-input w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
        </div>

        {/* Artist */}
        <div>
          <label htmlFor="edit-artist" className="mb-2 block text-sm font-medium text-gray-300">
            Artis
          </label>
          <input
            id="edit-artist"
            type="text"
            value={editArtist}
            onChange={(e) => setEditArtist(e.target.value)}
            placeholder="Nama Artis"
            className="glass-input w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
        </div>

        {/* Raw Lyrics */}
        <div>
          <label htmlFor="edit-lyrics" className="mb-2 block text-sm font-medium text-gray-300">
            Lirik
          </label>
          <div className="relative">
            <textarea
              id="edit-lyrics"
              value={editLyrics}
              onChange={(e) => setEditLyrics(e.target.value)}
              rows={16}
              placeholder="Tempel lirik di sini..."
              className="glass-input w-full rounded-xl px-4 py-3 text-sm leading-relaxed text-white placeholder:text-gray-500 focus:outline-none resize-none"
            />
            {editLyrics && (
              <div className="absolute bottom-3 right-3 text-[10px] text-gray-500">
                {editLyrics.split('\n').length} baris
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
