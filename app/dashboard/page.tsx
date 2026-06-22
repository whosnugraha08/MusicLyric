'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { Song, SyncStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import SongCard from '@/components/SongCard';

// ────────────────────────────────────────────────────────────
// Filter Tabs
// ────────────────────────────────────────────────────────────

type FilterTab = 'all' | SyncStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'synced', label: 'Tersinkron' },
  { key: 'unsynced', label: 'Belum Sinkron' },
  { key: 'needs_correction', label: 'Perlu Koreksi' },
];

// ────────────────────────────────────────────────────────────
// Skeleton Card
// ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="glass-card rounded-2xl p-3 animate-pulse">
      <div className="aspect-square w-full rounded-xl bg-white/[0.06]" />
      <div className="mt-3 space-y-2 px-1 pb-1">
        <div className="h-4 w-3/4 rounded-md bg-white/[0.06]" />
        <div className="h-3 w-1/2 rounded-md bg-white/[0.04]" />
        <div className="h-5 w-24 rounded-full bg-white/[0.05]" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Search Icon
// ────────────────────────────────────────────────────────────

function IconSearch({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Library Page
// ────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Fetch songs on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchSongs() {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('songs')
        .select('*')
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setSongs((data as Song[]) ?? []);
      setLoading(false);
    }

    fetchSongs();
    return () => { cancelled = true; };
  }, []);

  // Filter + search
  const filteredSongs = useMemo(() => {
    let result = songs;

    if (activeTab !== 'all') {
      result = result.filter((s) => s.sync_status === activeTab);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q)
      );
    }

    return result;
  }, [songs, activeTab, search]);

  const handleDelete = (deletedId: string) => {
    setSongs((prev) => prev.filter((s) => s.id !== deletedId));
  };

  // ── Loading ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-fade-in">
        {/* Header skeleton */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-32 rounded-lg bg-white/[0.06] animate-pulse" />
            <div className="h-6 w-10 rounded-full bg-white/[0.05] animate-pulse" />
          </div>
          <div className="h-10 w-full max-w-xs rounded-xl bg-white/[0.04] animate-pulse" />
        </div>
        {/* Tab skeleton */}
        <div className="mb-6 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-white/[0.04] animate-pulse" />
          ))}
        </div>
        {/* Grid skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────
  if (error) {
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
          <h3 className="text-lg font-semibold text-white">Gagal Memuat Data</h3>
          <p className="mt-2 text-sm text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-primary-500/20 px-5 py-2 text-sm font-medium text-primary-300 transition-colors hover:bg-primary-500/30"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  // ── Main View ──────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">My Library</h2>
          <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-primary-500/20 px-2.5 text-xs font-semibold text-primary-300">
            {songs.length}
          </span>
        </div>
        {/* Search */}
        <div className="relative w-full max-w-xs">
          <IconSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul atau artis..."
            className="glass-input w-full rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTER_TABS.map(({ key, label }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`
                rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200
                ${
                  isActive
                    ? 'bg-primary-500/20 text-primary-300 shadow-sm shadow-primary-500/10'
                    : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:text-white'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Song Grid or Empty State */}
      {filteredSongs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredSongs.map((song) => (
            <SongCard key={song.id} song={song} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="glass-card max-w-sm rounded-2xl p-10 text-center">
            {/* Music illustration */}
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/20 to-accent-500/20">
              <span className="text-4xl animate-float">🎶</span>
            </div>
            <h3 className="text-lg font-semibold text-white">
              {search || activeTab !== 'all'
                ? 'Tidak Ada Hasil'
                : 'Library Masih Kosong'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              {search || activeTab !== 'all'
                ? 'Coba ubah kata kunci atau filter pencarian.'
                : 'Upload lagu pertamamu dan mulai buat lyric video yang menakjubkan.'}
            </p>
            {!search && activeTab === 'all' && (
              <Link
                href="/dashboard/upload"
                className="btn-glow mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all hover:shadow-primary-500/40"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Upload Lagu
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
