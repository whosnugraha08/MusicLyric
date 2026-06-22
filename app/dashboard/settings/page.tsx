'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    async function checkDb() {
      try {
        const { error } = await supabase.from('songs').select('id').limit(1);
        if (error) {
          setDbStatus('error');
          setDbError(error.message);
        } else {
          setDbStatus('connected');
        }
      } catch (err) {
        setDbStatus('error');
        setDbError(err instanceof Error ? err.message : 'Unknown error');
      }
    }
    
    checkDb();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-2xl border border-white/10 bg-surface-50 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white mb-6">Status Sistem</h2>
        
        <div className="space-y-6">
          {/* Database Status */}
          <div className="flex items-start justify-between rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <div>
              <h3 className="text-sm font-medium text-white">Supabase Database</h3>
              <p className="mt-1 text-sm text-gray-400">
                Koneksi ke database songs dan storage
              </p>
            </div>
            <div>
              {dbStatus === 'checking' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-500/15 px-3 py-1 text-xs font-medium text-gray-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
                  Memeriksa...
                </span>
              )}
              {dbStatus === 'connected' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Terhubung
                </span>
              )}
              {dbStatus === 'error' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  Error
                </span>
              )}
            </div>
          </div>

          {dbStatus === 'error' && (
            <div className="rounded-lg bg-red-500/10 p-4 border border-red-500/20">
              <p className="text-sm text-red-400">
                <span className="font-bold">Database Error:</span> {dbError}
              </p>
              <p className="text-sm text-red-300 mt-2">
                Pastikan kamu sudah menjalankan file `supabase/schema.sql` di Supabase Dashboard.
              </p>
            </div>
          )}

          {/* AI Status */}
          <div className="flex items-start justify-between rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <div>
              <h3 className="text-sm font-medium text-white">WhisperX AI Sync</h3>
              <p className="mt-1 text-sm text-gray-400">
                Konfigurasi API untuk Hugging Face Spaces
              </p>
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-400">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                Dikonfigurasi
              </span>
            </div>
          </div>
          
          {/* Auth Status */}
          <div className="flex items-start justify-between rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <div>
              <h3 className="text-sm font-medium text-white">Keamanan Akses</h3>
              <p className="mt-1 text-sm text-gray-400">
                Password protection aktif
              </p>
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Aktif
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-surface-50 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white mb-2">Bantuan & Dokumentasi</h2>
        <p className="text-sm text-gray-400 mb-6">Informasi tambahan untuk mengelola aplikasi.</p>
        
        <ul className="space-y-4 text-sm text-gray-300 list-inside list-disc">
          <li>Untuk mengganti password, ubah variable `ADMIN_PASSWORD` di Vercel Environment Variables.</li>
          <li>Untuk mengganti Hugging Face Space AI, ubah variable `WHISPERX_API_URL`.</li>
          <li>Untuk mengelola file audio dan cover yang tidak terpakai, buka Supabase Storage.</li>
        </ul>
      </div>
    </div>
  );
}
