import Link from "next/link";

function SoundWave() {
  const bars = [
    { delay: "0s", height: "h-4" },
    { delay: "0.15s", height: "h-6" },
    { delay: "0.3s", height: "h-8" },
    { delay: "0.45s", height: "h-10" },
    { delay: "0.2s", height: "h-7" },
    { delay: "0.35s", height: "h-5" },
    { delay: "0.5s", height: "h-9" },
    { delay: "0.1s", height: "h-6" },
    { delay: "0.4s", height: "h-4" },
  ];

  return (
    <div className="flex items-end gap-1" aria-hidden="true">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-primary-500 to-accent-400 animate-wave-bar"
          style={{
            animationDelay: bar.delay,
            animationDuration: `${1 + Math.random() * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}

function FloatingNote({ className, delay }: { className: string; delay: string }) {
  return (
    <div
      className={`absolute text-primary-400/20 text-4xl animate-float select-none pointer-events-none ${className}`}
      style={{ animationDelay: delay, animationDuration: "4s" }}
      aria-hidden="true"
    >
      ♪
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 animate-gradient-shift bg-[length:400%_400%]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 50%, rgba(147,51,234,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(6,182,212,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(147,51,234,0.08) 0%, transparent 50%), linear-gradient(180deg, #09090b 0%, #0f0f14 50%, #09090b 100%)",
        }}
      />

      {/* Subtle grain/noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Floating musical notes */}
      <FloatingNote className="top-[15%] left-[10%]" delay="0s" />
      <FloatingNote className="top-[25%] right-[15%]" delay="1s" />
      <FloatingNote className="bottom-[30%] left-[20%]" delay="0.5s" />
      <FloatingNote className="bottom-[20%] right-[10%]" delay="1.5s" />
      <FloatingNote className="top-[40%] left-[5%]" delay="2s" />
      <FloatingNote className="top-[10%] right-[25%]" delay="0.8s" />

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        {/* Sound wave decoration - top */}
        <div className="mb-4">
          <SoundWave />
        </div>

        {/* Logo & Title */}
        <div className="space-y-4">
          <h1 className="text-6xl font-extrabold tracking-tight text-glow sm:text-7xl lg:text-8xl">
            <span className="gradient-text">Lyric</span>
            <span className="text-white">Stage</span>
          </h1>

          <p className="mx-auto max-w-md text-lg font-light tracking-wide text-zinc-400 sm:text-xl">
            Personal Lyric Video Studio
          </p>
        </div>

        {/* Divider accent */}
        <div className="flex items-center gap-3">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary-500/50" />
          <div className="h-1.5 w-1.5 rounded-full bg-primary-500" />
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-primary-500/50" />
        </div>

        {/* Description */}
        <p className="mx-auto max-w-lg text-sm leading-relaxed text-zinc-500">
          Buat video lirik yang memukau dengan teks tersinkronisasi, 
          background yang indah, dan animasi yang halus.
        </p>

        {/* CTA Button */}
        <Link
          href="/login"
          className="btn-glow group relative mt-4 inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary-500/30 active:scale-[0.98]"
        >
          <span>Mulai Sekarang</span>
          <svg
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>

        {/* Sound wave decoration - bottom */}
        <div className="mt-8 opacity-40">
          <SoundWave />
        </div>
      </main>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#09090b] to-transparent" />
    </div>
  );
}
