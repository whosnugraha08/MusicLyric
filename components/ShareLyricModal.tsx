'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SyncedLine } from '@/lib/types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface ShareLyricModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: {
    title: string;
    artist: string;
    cover_url: string | null;
    audio_url: string | null;
  };
  syncedLyrics: SyncedLine[];
}

type AspectRatio = '9:16' | '1:1' | '16:9';
type OutputMode = 'image' | 'video';

const ASPECT_CONFIGS: Record<AspectRatio, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: 'Story' },
  '1:1':  { w: 1080, h: 1080, label: 'Post' },
  '16:9': { w: 1920, h: 1080, label: 'Banner' },
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/** Get active line index for a given time */
function getActiveIdx(lines: SyncedLine[], time: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (time >= lines[i].start) idx = i; else break;
  }
  return idx;
}

// ────────────────────────────────────────────────────────────
// Canvas Renderer
// ────────────────────────────────────────────────────────────

function renderFrame(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  coverImg: HTMLImageElement | null,
  song: { title: string; artist: string },
  lyrics: SyncedLine[],
  activeLineIdx: number,   // -1 = none highlighted, for image mode highlight all
  highlightAll: boolean,
  timeRange: string,
) {
  // ── Background ──────────────────────────────────────
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, cw, ch);

  if (coverImg) {
    ctx.save();
    ctx.filter = 'blur(40px) brightness(0.4)';
    const imgR = coverImg.width / coverImg.height;
    const canR = cw / ch;
    let sx = 0, sy = 0, sw = coverImg.width, sh = coverImg.height;
    if (imgR > canR) { sw = coverImg.height * canR; sx = (coverImg.width - sw) / 2; }
    else { sh = coverImg.width / canR; sy = (coverImg.height - sh) / 2; }
    ctx.drawImage(coverImg, sx, sy, sw, sh, 0, 0, cw, ch);
    ctx.restore();
  }

  // Dark overlay
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, 'rgba(10,10,15,0.6)');
  grad.addColorStop(0.5, 'rgba(10,10,15,0.3)');
  grad.addColorStop(1, 'rgba(10,10,15,0.7)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  // ── Cover art ───────────────────────────────────────
  const coverSize = Math.min(cw * 0.35, ch * 0.22);
  if (coverImg) {
    const cx = (cw - coverSize) / 2;
    const cy = ch * 0.07;
    const radius = coverSize * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx, cy, coverSize, coverSize, radius);
    ctx.clip();
    ctx.drawImage(coverImg, cx, cy, coverSize, coverSize);
    ctx.restore();
    // Border
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx, cy, coverSize, coverSize, radius);
    ctx.stroke();
    ctx.restore();
  }

  // ── Song info ───────────────────────────────────────
  const infoY = ch * 0.07 + coverSize + ch * 0.035;
  ctx.textAlign = 'center';
  const titleSize = Math.max(16, cw * 0.038);
  ctx.font = `bold ${titleSize}px 'Inter','Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(song.title, cw / 2, infoY, cw * 0.8);
  const artistSize = Math.max(12, cw * 0.026);
  ctx.font = `${artistSize}px 'Inter','Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(song.artist, cw / 2, infoY + titleSize * 1.3, cw * 0.8);

  // ── Lyrics ──────────────────────────────────────────
  const lyricStartY = infoY + titleSize * 1.3 + ch * 0.045;
  const lyricEndY = ch * 0.88;
  const availH = lyricEndY - lyricStartY;
  const baseFontSize = Math.max(14, Math.min(cw * 0.04, 40));
  ctx.font = `600 ${baseFontSize}px 'Inter','Segoe UI',sans-serif`;
  const maxTextWidth = cw * 0.82;

  // Wrap all lines
  const wrapped: { text: string; lineIdx: number }[] = [];
  lyrics.forEach((line, i) => {
    const ws = wrapText(ctx, line.text, maxTextWidth);
    ws.forEach((t) => wrapped.push({ text: t, lineIdx: i }));
  });

  const lineHeight = baseFontSize * 1.7;
  const totalH = wrapped.length * lineHeight;
  const startY = lyricStartY + (availH - totalH) / 2;

  wrapped.forEach((wl, wi) => {
    const y = startY + wi * lineHeight + lineHeight / 2;
    const isActive = highlightAll || wl.lineIdx === activeLineIdx;
    const isPast = !highlightAll && activeLineIdx >= 0 && wl.lineIdx < activeLineIdx;

    ctx.textAlign = 'center';
    ctx.font = `${isActive ? 'bold' : '600'} ${isActive ? baseFontSize * 1.05 : baseFontSize}px 'Inter','Segoe UI',sans-serif`;

    if (isActive) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      // Glow
      ctx.save();
      ctx.shadowColor = 'rgba(160,120,255,0.4)';
      ctx.shadowBlur = 15;
      ctx.fillText(wl.text, cw / 2, y);
      ctx.restore();
    } else if (isPast) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(wl.text, cw / 2, y);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(wl.text, cw / 2, y);
    }
  });

  // ── Bottom bar ──────────────────────────────────────
  const bottomY = ch * 0.94;
  const smallSize = Math.max(10, cw * 0.02);
  ctx.font = `${smallSize}px 'Inter','Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'left';
  ctx.fillText(timeRange, cw * 0.08, bottomY);
  ctx.textAlign = 'right';
  ctx.fillText('MusicLyric ♪', cw * 0.92, bottomY);
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function ShareLyricModal({
  isOpen,
  onClose,
  song,
  syncedLyrics,
}: ShareLyricModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverImgRef = useRef<HTMLImageElement | null>(null);

  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(Math.min(3, syncedLyrics.length - 1));
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [mode, setMode] = useState<OutputMode>('image');
  const [selectingStart, setSelectingStart] = useState(true);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);

  // Refs for video recording
  const recorderRef = useRef<MediaRecorder | null>(null);
  const animFrameRef = useRef(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // ── Load cover image ─────────────────────────────────────
  useEffect(() => {
    if (!song.cover_url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { coverImgRef.current = img; setCoverLoaded(true); };
    img.onerror = () => setCoverLoaded(false);
    img.src = song.cover_url;
  }, [song.cover_url]);

  // ── Clamp indices ────────────────────────────────────────
  useEffect(() => {
    if (startIdx > endIdx) setEndIdx(startIdx);
  }, [startIdx, endIdx]);

  // ── Handle lyric click ──────────────────────────────────
  const handleLyricClick = (idx: number) => {
    if (selectingStart) {
      setStartIdx(idx);
      if (idx > endIdx) setEndIdx(idx);
      setSelectingStart(false);
    } else {
      if (idx >= startIdx) setEndIdx(idx);
      else { setStartIdx(idx); setEndIdx(idx); }
      setSelectingStart(true);
    }
  };

  // ── Derived ──────────────────────────────────────────────
  const selectedLyrics = syncedLyrics.slice(startIdx, endIdx + 1);
  const timeRange = selectedLyrics.length > 0
    ? `${formatTime(selectedLyrics[0].start)} – ${formatTime(selectedLyrics[selectedLyrics.length - 1].start)}`
    : '';

  // ── Render preview (image mode) ──────────────────────────
  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const config = ASPECT_CONFIGS[aspect];
    const scale = 0.3;
    canvas.width = config.w * scale;
    canvas.height = config.h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderFrame(ctx, canvas.width, canvas.height, coverImgRef.current, song, selectedLyrics, -1, true, timeRange);
  }, [aspect, coverLoaded, selectedLyrics, song, timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen && mode === 'image') {
      const t = setTimeout(() => renderPreview(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, mode, renderPreview]);

  // ── Render preview (video mode — animated loop) ──────────
  useEffect(() => {
    if (!isOpen || mode !== 'video') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const config = ASPECT_CONFIGS[aspect];
    const scale = 0.3;
    canvas.width = config.w * scale;
    canvas.height = config.h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const totalDuration = selectedLyrics.length > 0
      ? (selectedLyrics[selectedLyrics.length - 1].start - selectedLyrics[0].start + 2)
      : 5;
    const startTime = selectedLyrics.length > 0 ? selectedLyrics[0].start : 0;
    let animStart = performance.now();

    const animate = () => {
      const elapsed = ((performance.now() - animStart) / 1000) % totalDuration;
      const simTime = startTime + elapsed;
      const activeIdx = getActiveIdx(selectedLyrics, simTime);
      renderFrame(ctx, canvas.width, canvas.height, coverImgRef.current, song, selectedLyrics, activeIdx, false, timeRange);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isOpen, mode, aspect, coverLoaded, selectedLyrics, song, timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Download Image ───────────────────────────────────────
  const handleDownloadImage = async () => {
    setGenerating(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const config = ASPECT_CONFIGS[aspect];
      canvas.width = config.w;
      canvas.height = config.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderFrame(ctx, config.w, config.h, coverImgRef.current, song, selectedLyrics, -1, true, timeRange);

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${song.title} - lyrics.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
      // Re-render preview
      renderPreview();
    } finally {
      setGenerating(false);
    }
  };

  // ── Record Video ─────────────────────────────────────────
  const handleRecordVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !song.audio_url) return;

    setGenerating(true);
    setRecordingProgress(0);

    try {
      const config = ASPECT_CONFIGS[aspect];
      canvas.width = config.w;
      canvas.height = config.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const audioStartTime = selectedLyrics[0]?.start ?? 0;
      const audioEndTime = (selectedLyrics[selectedLyrics.length - 1]?.start ?? 0) + 3; // 3s buffer after last line
      const clipDuration = audioEndTime - audioStartTime;

      // ── Set up audio ────────────────────────────────
      const audioEl = new Audio();
      audioEl.crossOrigin = 'anonymous';
      audioEl.src = song.audio_url;
      audioEl.currentTime = audioStartTime;
      audioElRef.current = audioEl;

      await new Promise<void>((resolve, reject) => {
        audioEl.oncanplaythrough = () => resolve();
        audioEl.onerror = () => reject(new Error('Audio load failed'));
        audioEl.load();
      });

      // ── Capture streams ─────────────────────────────
      const videoStream = canvas.captureStream(30);

      // Audio stream via AudioContext
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(audioEl);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination); // Also play through speakers

      // Combine video + audio
      const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      // ── MediaRecorder ───────────────────────────────
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(combined, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm',
        videoBitsPerSecond: 5_000_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${song.title} - lyrics.webm`;
        a.click();
        URL.revokeObjectURL(url);

        audioEl.pause();
        audioCtx.close();
        setGenerating(false);
        setRecordingProgress(0);

        // Restore preview size
        const scale = 0.3;
        canvas.width = config.w * scale;
        canvas.height = config.h * scale;
      };

      // ── Animation loop ──────────────────────────────
      audioEl.currentTime = audioStartTime;
      await audioEl.play();
      recorder.start();

      const renderLoop = () => {
        if (!audioEl || audioEl.paused) return;

        const currentTime = audioEl.currentTime;
        const progress = Math.min(1, (currentTime - audioStartTime) / clipDuration);
        setRecordingProgress(Math.round(progress * 100));

        if (currentTime >= audioEndTime) {
          recorder.stop();
          cancelAnimationFrame(animFrameRef.current);
          return;
        }

        const activeIdx = getActiveIdx(selectedLyrics, currentTime);
        renderFrame(ctx, config.w, config.h, coverImgRef.current, song, selectedLyrics, activeIdx, false, timeRange);
        animFrameRef.current = requestAnimationFrame(renderLoop);
      };

      animFrameRef.current = requestAnimationFrame(renderLoop);
    } catch (err) {
      console.error('Video recording error:', err);
      setGenerating(false);
      setRecordingProgress(0);
    }
  };

  // ── Cancel recording ─────────────────────────────────────
  const handleCancelRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
    }
    cancelAnimationFrame(animFrameRef.current);
    setGenerating(false);
    setRecordingProgress(0);
  };

  // ── Share (Web Share API) ────────────────────────────────
  const handleShare = async () => {
    setGenerating(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const config = ASPECT_CONFIGS[aspect];
      canvas.width = config.w;
      canvas.height = config.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderFrame(ctx, config.w, config.h, coverImgRef.current, song, selectedLyrics, -1, true, timeRange);

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (blob && navigator.share) {
        const file = new File([blob], `${song.title} - lyrics.png`, { type: 'image/png' });
        await navigator.share({ files: [file], title: song.title, text: `${song.title} – ${song.artist}` });
      } else if (blob) {
        // Fallback download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${song.title} - lyrics.png`; a.click();
        URL.revokeObjectURL(url);
      }
      renderPreview();
    } catch { /* cancelled */ } finally {
      setGenerating(false);
    }
  };

  // ── Cleanup on close ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      handleCancelRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-card rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">Share Lyric</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Pilih bagian lirik, download sebagai gambar atau video
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {/* Left: Lyric selector */}
          <div className="lg:w-[45%] flex flex-col border-b lg:border-b-0 lg:border-r border-white/10">
            {/* Selection hint */}
            <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/5 flex items-center justify-between">
              <p className="text-xs text-white/50">
                {selectingStart ? (
                  <span>👆 Klik baris <strong className="text-primary-400">AWAL</strong></span>
                ) : (
                  <span>👇 Klik baris <strong className="text-accent-400">AKHIR</strong></span>
                )}
                <span className="ml-2 text-white/30">{timeRange}</span>
              </p>
            </div>

            {/* Lyric list */}
            <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-2 space-y-0.5 max-h-[30vh] lg:max-h-none">
              {syncedLyrics.map((line, i) => {
                const isSelected = i >= startIdx && i <= endIdx;
                const isStart = i === startIdx;
                const isEnd = i === endIdx;
                return (
                  <button
                    key={i}
                    onClick={() => handleLyricClick(i)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                      isSelected
                        ? 'bg-primary-500/20 text-white'
                        : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                    } ${isStart ? 'rounded-t-xl border-l-2 border-primary-400' : ''} ${
                      isEnd ? 'rounded-b-xl border-l-2 border-accent-400' : ''
                    } ${isSelected && !isStart && !isEnd ? 'border-l-2 border-white/20' : ''}`}
                  >
                    <span className="text-[10px] text-white/30 mr-2 font-mono">{formatTime(line.start)}</span>
                    {line.text}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Preview + Controls */}
          <div className="lg:w-[55%] flex flex-col p-4 gap-3 overflow-y-auto">
            {/* Mode + Aspect selectors */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Output mode toggle */}
              <div className="flex rounded-xl overflow-hidden border border-white/10">
                <button
                  onClick={() => setMode('image')}
                  className={`px-3 py-1.5 text-xs font-medium transition-all ${
                    mode === 'image' ? 'bg-primary-500/30 text-primary-300' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  🖼️ Gambar
                </button>
                <button
                  onClick={() => setMode('video')}
                  disabled={!song.audio_url}
                  className={`px-3 py-1.5 text-xs font-medium transition-all ${
                    mode === 'video' ? 'bg-accent-500/30 text-accent-300' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  🎬 Video
                </button>
              </div>

              {/* Aspect ratio */}
              <div className="flex gap-1 ml-auto">
                {(Object.keys(ASPECT_CONFIGS) as AspectRatio[]).map((ar) => (
                  <button
                    key={ar}
                    onClick={() => setAspect(ar)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      aspect === ar
                        ? 'bg-white/15 text-white ring-1 ring-white/20'
                        : 'bg-white/5 text-white/40 hover:bg-white/10'
                    }`}
                  >
                    {ASPECT_CONFIGS[ar].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas preview */}
            <div className="flex-1 flex items-center justify-center min-h-[180px]">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[45vh] rounded-xl shadow-2xl border border-white/10"
              />
            </div>

            {/* Recording progress */}
            {generating && mode === 'video' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>🔴 Merekam video...</span>
                  <span>{recordingProgress}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-accent-400 rounded-full transition-all"
                    style={{ width: `${recordingProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {mode === 'image' ? (
                <>
                  <button
                    onClick={handleDownloadImage}
                    disabled={generating}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-medium text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Download Gambar
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={generating}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 text-white font-medium text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    Share
                  </button>
                </>
              ) : (
                <>
                  {!generating ? (
                    <button
                      onClick={handleRecordVideo}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-red-600 to-accent-500 hover:from-red-500 hover:to-accent-400 text-white font-medium text-sm transition-all active:scale-[0.98]"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="8" />
                      </svg>
                      Rekam Video
                    </button>
                  ) : (
                    <button
                      onClick={handleCancelRecording}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-all active:scale-[0.98]"
                    >
                      ⏹️ Stop & Download
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
