'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import type { SongInsert } from '@/lib/types';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ────────────────────────────────────────────────────────────
// Upload Page
// ────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [rawLyrics, setRawLyrics] = useState('');

  // File state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Upload progress
  const [audioProgress, setAudioProgress] = useState(0);
  const [coverProgress, setCoverProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Drag state
  const [audioDragActive, setAudioDragActive] = useState(false);
  const [coverDragActive, setCoverDragActive] = useState(false);

  // Refs
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // ── Audio File Handling ────────────────────────────────
  const handleAudioSelect = useCallback((file: File) => {
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'audio/x-wav'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a)$/i)) {
      setError('Format audio tidak didukung. Gunakan MP3, WAV, atau M4A.');
      return;
    }
    setAudioFile(file);
    setError(null);

    // Auto-fill title from filename if empty
    if (!title) {
      const name = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTitle(name);
    }
  }, [title]);

  const handleAudioDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setAudioDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleAudioSelect(file);
    },
    [handleAudioSelect]
  );

  // ── Cover File Handling ────────────────────────────────
  const handleCoverSelect = useCallback((file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.');
      return;
    }
    setCoverFile(file);
    setError(null);

    // Generate preview
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  }, []);

  const handleCoverDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setCoverDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleCoverSelect(file);
    },
    [handleCoverSelect]
  );

  // ── Submit Handler ─────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Judul lagu wajib diisi.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setAudioProgress(0);
    setCoverProgress(0);

    const songId = generateId();
    let audioUrl: string | null = null;
    let coverUrl: string | null = null;

    try {
      // 1. Upload audio
      if (audioFile) {
        const ext = audioFile.name.split('.').pop()?.toLowerCase() ?? 'mp3';
        const filePath = `${songId}/audio.${ext}`;

        // Simulate progress since Supabase JS client doesn't expose upload progress
        const progressInterval = setInterval(() => {
          setAudioProgress((prev) => Math.min(prev + 15, 90));
        }, 200);

        const { error: uploadError } = await supabase.storage
          .from('audio')
          .upload(filePath, audioFile, {
            cacheControl: '3600',
            upsert: false,
          });

        clearInterval(progressInterval);

        if (uploadError) throw new Error(`Audio upload gagal: ${uploadError.message}`);

        setAudioProgress(100);
        audioUrl = supabase.storage.from('audio').getPublicUrl(filePath).data.publicUrl;
      }

      // 2. Upload cover
      if (coverFile) {
        const ext = coverFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const filePath = `${songId}/cover.${ext}`;

        const progressInterval = setInterval(() => {
          setCoverProgress((prev) => Math.min(prev + 20, 90));
        }, 150);

        const { error: uploadError } = await supabase.storage
          .from('covers')
          .upload(filePath, coverFile, {
            cacheControl: '3600',
            upsert: false,
          });

        clearInterval(progressInterval);

        if (uploadError) throw new Error(`Cover upload gagal: ${uploadError.message}`);

        setCoverProgress(100);
        coverUrl = supabase.storage.from('covers').getPublicUrl(filePath).data.publicUrl;
      }

      // 3. Insert song record
      const songData: SongInsert = {
        title: title.trim(),
        artist: artist.trim() || 'Unknown Artist',
        audio_url: audioUrl,
        cover_url: coverUrl,
        raw_lyrics: rawLyrics.trim() || null,
        synced_lyrics: null,
        sync_status: 'unsynced',
        duration: null,
      };

      const { data, error: insertError } = await supabase
        .from('songs')
        .insert({ id: songId, ...songData })
        .select('id')
        .single();

      if (insertError) throw new Error(`Gagal menyimpan: ${insertError.message}`);

      setSuccess(true);

      // 4. Redirect after brief success message
      setTimeout(() => {
        router.push(`/dashboard/songs/${data.id}`);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat upload.');
      setSubmitting(false);
    }
  };

  // ── Progress Bar Component ─────────────────────────────
  const ProgressBar = ({ progress, label }: { progress: number; label: string }) => {
    if (progress === 0) return null;
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
          <span>{label}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  };

  // ── Success Overlay ────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <div className="glass-card rounded-2xl p-10 text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
            <svg className="h-8 w-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white">Berhasil!</h3>
          <p className="mt-2 text-sm text-gray-400">Lagu berhasil disimpan. Mengalihkan...</p>
        </div>
      </div>
    );
  }

  // ── Form View ──────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
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

        {/* Audio Upload Zone */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">
            File Audio <span className="text-gray-500">(MP3, WAV, M4A)</span>
          </label>
          <div
            className={`
              relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center
              transition-all duration-200
              ${
                audioDragActive
                  ? 'border-primary-400 bg-primary-500/10'
                  : audioFile
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
              }
            `}
            onDragOver={(e) => { e.preventDefault(); setAudioDragActive(true); }}
            onDragLeave={() => setAudioDragActive(false)}
            onDrop={handleAudioDrop}
            onClick={() => audioInputRef.current?.click()}
          >
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAudioSelect(file);
              }}
            />
            {audioFile ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15">
                  <svg className="h-6 w-6 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-white">{audioFile.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(audioFile.size)}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAudioFile(null);
                    setAudioProgress(0);
                  }}
                  className="mt-1 text-xs text-gray-500 underline hover:text-gray-300"
                >
                  Ganti file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04]">
                  <svg className="h-7 w-7 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-300">
                    Seret & lepas file audio di sini
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    atau klik untuk memilih file
                  </p>
                </div>
              </div>
            )}
          </div>
          <ProgressBar progress={audioProgress} label="Mengupload audio" />
        </div>

        {/* Cover Art Upload */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">
            Cover Art <span className="text-gray-500">(JPG, PNG, WebP — opsional)</span>
          </label>
          <div className="flex gap-4">
            {/* Preview */}
            <div
              className={`
                relative h-28 w-28 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 border-dashed
                transition-all duration-200
                ${
                  coverDragActive
                    ? 'border-primary-400 bg-primary-500/10'
                    : coverPreview
                      ? 'border-white/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }
              `}
              onDragOver={(e) => { e.preventDefault(); setCoverDragActive(true); }}
              onDragLeave={() => setCoverDragActive(false)}
              onDrop={handleCoverDrop}
              onClick={() => coverInputRef.current?.click()}
            >
              <input
                ref={coverInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCoverSelect(file);
                }}
              />
              {coverPreview ? (
                <Image
                  src={coverPreview}
                  alt="Cover preview"
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                  <svg className="h-6 w-6 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span className="text-[10px] text-gray-500">Cover</span>
                </div>
              )}
            </div>
            {/* Cover info */}
            <div className="flex flex-col justify-center">
              {coverFile ? (
                <>
                  <p className="text-sm font-medium text-white">{coverFile.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(coverFile.size)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCoverFile(null);
                      setCoverPreview(null);
                      setCoverProgress(0);
                    }}
                    className="mt-1 text-left text-xs text-gray-500 underline hover:text-gray-300"
                  >
                    Hapus cover
                  </button>
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  Klik atau seret gambar ke area di samping
                </p>
              )}
            </div>
          </div>
          <ProgressBar progress={coverProgress} label="Mengupload cover" />
        </div>

        {/* Title Input */}
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-medium text-gray-300">
            Judul Lagu <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Masukkan judul lagu"
            className="glass-input w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
        </div>

        {/* Artist Input */}
        <div>
          <label htmlFor="artist" className="mb-2 block text-sm font-medium text-gray-300">
            Artis
          </label>
          <input
            id="artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Nama Artis"
            className="glass-input w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
        </div>

        {/* Raw Lyrics Textarea */}
        <div>
          <label htmlFor="lyrics" className="mb-2 block text-sm font-medium text-gray-300">
            Lirik <span className="text-gray-500">(opsional)</span>
          </label>
          <div className="relative">
            <textarea
              id="lyrics"
              value={rawLyrics}
              onChange={(e) => setRawLyrics(e.target.value)}
              rows={12}
              placeholder="Tempel lirik di sini..."
              className="glass-input w-full rounded-xl px-4 py-3 text-sm leading-relaxed text-white placeholder:text-gray-500 focus:outline-none resize-none"
            />
            {rawLyrics && (
              <div className="absolute bottom-3 right-3 text-[10px] text-gray-500">
                {rawLyrics.split('\n').length} baris
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">
            Tulis satu baris lirik per baris. Baris kosong akan memisahkan bagian/bait.
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className={`
              btn-glow flex items-center gap-2.5 rounded-xl px-8 py-3 text-sm font-semibold text-white
              shadow-lg transition-all duration-200
              ${
                submitting || !title.trim()
                  ? 'cursor-not-allowed bg-gray-600 opacity-50 shadow-none'
                  : 'bg-gradient-to-r from-primary-600 to-primary-500 shadow-primary-500/25 hover:shadow-primary-500/40'
              }
            `}
          >
            {submitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                Menyimpan...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Simpan ke Library
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
