'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface AudioPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  isPlaying: () => boolean;
}

interface AudioPlayerProps {
  src: string;
  title?: string;
  artist?: string;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onEnded?: () => void;
  className?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  function AudioPlayer(
    { src, title, artist, onTimeUpdate, onDurationChange, onEnded, className },
    ref,
  ) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number>(0);
    const progressBarRef = useRef<HTMLDivElement>(null);

    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);

    // ── RAF loop for precise time reporting ─────────────────
    const tick = useCallback(() => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        const t = audio.currentTime;
        setCurrentTime(t);
        onTimeUpdate?.(t);

        // Buffered range
        if (audio.buffered.length > 0) {
          setBuffered(audio.buffered.end(audio.buffered.length - 1));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }, [onTimeUpdate]);

    useEffect(() => {
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }, [tick]);

    // ── Imperative handle ───────────────────────────────────
    useImperativeHandle(ref, () => ({
      play() {
        audioRef.current?.play();
      },
      pause() {
        audioRef.current?.pause();
      },
      seek(time: number) {
        if (audioRef.current) {
          audioRef.current.currentTime = time;
          setCurrentTime(time);
          onTimeUpdate?.(time);
        }
      },
      getCurrentTime() {
        return audioRef.current?.currentTime ?? 0;
      },
      isPlaying() {
        return !(audioRef.current?.paused ?? true);
      },
    }));

    // ── Audio event handlers ────────────────────────────────
    const handleLoadedMetadata = () => {
      const d = audioRef.current?.duration ?? 0;
      setDuration(d);
      onDurationChange?.(d);
    };

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);

    const handleEnded = () => {
      setPlaying(false);
      onEnded?.();
    };

    // ── Toggle ──────────────────────────────────────────────
    const togglePlay = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    };

    // ── Seek by click ───────────────────────────────────────
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressBarRef.current;
      const audio = audioRef.current;
      if (!bar || !audio) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = ratio * duration;
      audio.currentTime = newTime;
      setCurrentTime(newTime);
      onTimeUpdate?.(newTime);
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

    return (
      <>
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
        />

        {/* Mini player bar */}
        <div
          className={`fixed bottom-0 inset-x-0 z-50 ${className ?? ''}`}
        >
          {/* Progress bar — full width, clickable, sits on top edge */}
          <div
            ref={progressBarRef}
            onClick={handleProgressClick}
            className="group relative h-1 w-full cursor-pointer transition-all hover:h-2"
          >
            {/* Track background */}
            <div className="absolute inset-0 bg-white/10" />
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 bg-white/15 transition-all"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Progress */}
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-400 to-accent-400 transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* Knob (visible on hover) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow-lg shadow-primary-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>

          {/* Controls bar */}
          <div className="glass-strong flex items-center gap-4 px-4 py-2.5 sm:px-6">
            {/* Play / Pause */}
            <button
              onClick={togglePlay}
              className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                /* Pause icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="3" width="5" height="18" rx="1" />
                  <rect x="14" y="3" width="5" height="18" rx="1" />
                </svg>
              ) : (
                /* Play icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 3.5v17a1 1 0 001.5.86l14-8.5a1 1 0 000-1.72l-14-8.5A1 1 0 006 3.5z" />
                </svg>
              )}
            </button>

            {/* Title & Artist */}
            <div className="flex-1 min-w-0">
              {(title || artist) && (
                <div className="truncate">
                  {title && (
                    <span className="text-sm font-medium text-white">{title}</span>
                  )}
                  {artist && (
                    <span className="text-sm text-white/50 ml-2">— {artist}</span>
                  )}
                </div>
              )}
            </div>

            {/* Time display */}
            <div className="flex-shrink-0 text-xs text-white/50 font-mono tabular-nums">
              {formatTime(currentTime)}
              <span className="mx-1 text-white/25">/</span>
              {formatTime(duration)}
            </div>
          </div>
        </div>
      </>
    );
  },
);

export default AudioPlayer;
