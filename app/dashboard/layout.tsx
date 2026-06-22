'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ────────────────────────────────────────────────────────────
// Inline SVG Icons
// ────────────────────────────────────────────────────────────

function IconLibrary({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconUpload({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12l7-7 7 7" />
    </svg>
  );
}

function IconSettings({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconLogout({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconMenu({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconClose({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Navigation Config
// ────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Library', icon: IconLibrary, exact: true },
  { href: '/dashboard/upload', label: 'Upload', icon: IconUpload, exact: false },
  { href: '/dashboard/settings', label: 'Settings', icon: IconSettings, exact: false },
] as const;

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'My Library';
  if (pathname === '/dashboard/upload') return 'Upload Lagu Baru';
  if (pathname === '/dashboard/settings') return 'Settings';
  if (pathname.match(/^\/dashboard\/songs\/[^/]+$/)) return 'Detail Lagu';
  if (pathname.includes('/tap-sync')) return 'Tap-to-Sync';
  if (pathname.includes('/edit-sync')) return 'Edit Sinkronisasi';
  return 'Dashboard';
}

// ────────────────────────────────────────────────────────────
// Dashboard Layout
// ────────────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pageTitle = getPageTitle(pathname);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b]">
      {/* ── Mobile Overlay ──────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-64 flex-col
          border-r border-white/[0.06]
          bg-[#0f0f14]/80 backdrop-blur-2xl
          transition-transform duration-300 ease-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 group"
            onClick={closeSidebar}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-lg shadow-lg shadow-primary-500/25 transition-shadow group-hover:shadow-primary-500/40">
              🎵
            </span>
            <span className="text-lg font-bold tracking-tight text-white">
              Lyric<span className="text-primary-400">Stage</span>
            </span>
          </Link>
          <button
            onClick={closeSidebar}
            className="rounded-lg p-1 text-gray-500 hover:bg-white/5 hover:text-white lg:hidden"
          >
            <IconClose />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="mt-4 flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                onClick={closeSidebar}
                className={`
                  group flex items-center gap-3 rounded-xl px-3.5 py-2.5
                  text-sm font-medium transition-all duration-200
                  ${
                    active
                      ? 'bg-primary-500/15 text-primary-400 shadow-sm shadow-primary-500/10'
                      : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
                  }
                `}
              >
                <Icon
                  className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                    active ? 'text-primary-400' : 'text-gray-500 group-hover:text-gray-300'
                  }`}
                />
                {label}
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-400 shadow-sm shadow-primary-400/50" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-white/[0.06] p-3">
          <button
            onClick={() => {
              // Placeholder: redirect to landing or handle sign-out
              window.location.href = '/';
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-500 transition-all duration-200 hover:bg-red-500/10 hover:text-red-400"
          >
            <IconLogout className="w-[18px] h-[18px] flex-shrink-0" />
            Keluar
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-16 items-center gap-4 border-b border-white/[0.06] bg-[#09090b]/80 px-4 backdrop-blur-xl lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Open menu"
          >
            <IconMenu />
          </button>
          <h1 className="text-lg font-semibold text-white">{pageTitle}</h1>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
