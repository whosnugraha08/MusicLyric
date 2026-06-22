'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
// Cover Fallback Gradients
// ────────────────────────────────────────────────────────────

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

const GRADIENTS = [
  'from-purple-600 to-indigo-800',
  'from-pink-600 to-rose-800',
  'from-cyan-600 to-blue-800',
  'from-emerald-600 to-teal-800',
  'from-orange-600 to-red-800',
  'from-violet-600 to-purple-900',
  'from-teal-500 to-cyan-800',
  'from-fuchsia-600 to-pink-900',
];

function getGradient(id: string): string {
  return GRADIENTS[hashString(id) % GRADIENTS.length];
}

// ────────────────────────────────────────────────────────────
// SongCard Component
// ────────────────────────────────────────────────────────────

interface SongCardProps {
  song: Song;
  onDelete?: (id: string) => void;
}

export default function SongCard({ song, onDelete }: SongCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const status = STATUS_CONFIG[song.sync_status];
  const gradient = getGradient(song.id);

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowConfirm(true);
    },
    []
  );

  const confirmDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDeleting(true);

      // Delete audio & cover from storage
      if (song.audio_url) {
        const audioPath = song.audio_url.split('/storage/v1/object/public/audio/').pop();
        if (audioPath) await supabase.storage.from('audio').remove([audioPath]);
      }
      if (song.cover_url) {
        const coverPath = song.cover_url.split('/storage/v1/object/public/covers/').pop();
        if (coverPath) await supabase.storage.from('covers').remove([coverPath]);
      }

      const { error } = await supabase.from('songs').delete().eq('id', song.id);

      if (error) {
        setDeleting(false);
        setShowConfirm(false);
        return;
      }

      onDelete?.(song.id);
    },
    [song, onDelete]
  );

  const cancelDelete = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowConfirm(false);
    },
    []
  );

  return (
    <div
      className="group relative cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setShowConfirm(false);
      }}
      onClick={() => router.push(`/dashboard/songs/${song.id}`)}
    >
      <div
        className={`
          glass-card overflow-hidden rounded-2xl p-3 transition-all duration-300
          ${hovered ? 'scale-[1.02] shadow-xl shadow-black/40' : 'shadow-lg shadow-black/20'}
        `}
      >
        {/* Cover Art */}
        <div className="relative aspect-square w-full overflow-hidden rounded-xl">
          {song.cover_url ? (
            <Image
              src={song.cover_url}
              alt={song.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}
            >
              <svg className="h-12 w-12 text-white/30" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}

          {/* Hover Overlay */}
          <div
            className={`
              absolute inset-0 flex items-center justify-center gap-3
              bg-black/50 backdrop-blur-sm transition-opacity duration-300
              ${hovered ? 'opacity-100' : 'opacity-0'}
            `}
          >
            {!showConfirm ? (
              <>
                {/* Play */}
                {song.sync_status === 'synced' && (
                  <Link
                    href={`/player/${song.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg shadow-primary-500/30 transition-transform hover:scale-110"
                    title="Play"
                  >
                    <svg className="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </Link>
                )}

                {/* Edit */}
                <Link
                  href={`/dashboard/songs/${song.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-transform hover:scale-110 hover:bg-white/20"
                  title="Edit"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </Link>

                {/* Delete */}
                <button
                  onClick={handleDelete}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-transform hover:scale-110 hover:bg-red-500/30 hover:text-red-300"
                  title="Hapus"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </>
            ) : (
              /* Delete Confirmation */
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <p className="text-xs font-medium text-white">Hapus lagu ini?</p>
                <div className="flex gap-2">
                  <button
                    onClick={confirmDelete}
                    disabled={deleting}
                    className="rounded-lg bg-red-500/80 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                  >
                    {deleting ? 'Menghapus...' : 'Ya, Hapus'}
                  </button>
                  <button
                    onClick={cancelDelete}
                    className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-3 space-y-1.5 px-1 pb-1">
          <h3 className="truncate text-sm font-semibold text-white">
            {song.title}
          </h3>
          <p className="truncate text-xs text-gray-400">{song.artist}</p>
          <span
            className={`
              inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold
              ${status.className}
            `}
          >
            {status.pulse && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            )}
            {status.label}
          </span>
        </div>
      </div>
    </div>
  );
}
