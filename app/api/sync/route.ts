import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import { createClient } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────
// AI Sync API Route
// ────────────────────────────────────────────────────────────

const WHISPERX_API_URL = process.env.WHISPERX_API_URL || 'https://shirothol-whisperx-align.hf.space';
const HF_TOKEN = process.env.HF_TOKEN;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
);

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (HF_TOKEN) h['Authorization'] = `Bearer ${HF_TOKEN}`;
  return h;
}

export async function POST(request: NextRequest) {
  try {
    const { songId } = await request.json();
    if (!songId) return NextResponse.json({ error: 'songId is required' }, { status: 400 });

    const { data: song, error: fetchError } = await supabaseAdmin
      .from('songs').select('*').eq('id', songId).single();
    if (fetchError || !song) return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    if (!song.audio_url) return NextResponse.json({ error: 'No audio file uploaded' }, { status: 400 });
    if (!song.raw_lyrics || song.raw_lyrics.trim().length === 0)
      return NextResponse.json({ error: 'No lyrics provided' }, { status: 400 });

    await supabaseAdmin.from('songs').update({ sync_status: 'processing' }).eq('id', songId);

    try {
      const syncedLyrics = await callWhisperX(song.audio_url, song.raw_lyrics);
      await supabaseAdmin.from('songs').update({ synced_lyrics: syncedLyrics, sync_status: 'synced' }).eq('id', songId);
      return NextResponse.json({ success: true, message: 'Sinkronisasi berhasil!', linesCount: syncedLyrics.length });
    } catch (apiError) {
      console.error('WhisperX API error:', apiError);
      await supabaseAdmin.from('songs').update({ sync_status: 'failed' }).eq('id', songId);
      return NextResponse.json(
        { error: `AI sync failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}` },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('AI sync error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// Discover the correct Gradio API format
// ────────────────────────────────────────────────────────────

async function discoverAPI(): Promise<{ fnName: string; apiFormat: 'predict' | 'call' }> {
  // Try /info first (Gradio 4+)
  try {
    const res = await fetch(`${WHISPERX_API_URL}/info`, { headers: authHeaders() });
    if (res.ok) {
      const info = await res.json();
      // info.named_endpoints or info.unnamed_endpoints
      if (info.named_endpoints) {
        const endpoints = Object.keys(info.named_endpoints);
        const fn = endpoints[0]?.replace(/^\//, '') || 'predict';
        return { fnName: fn, apiFormat: 'call' };
      }
    }
  } catch { /* ignore */ }

  // Try /api/ endpoint (Gradio 3)
  try {
    const res = await fetch(`${WHISPERX_API_URL}/api/`, { headers: authHeaders() });
    if (res.ok) return { fnName: 'predict', apiFormat: 'predict' };
  } catch { /* ignore */ }

  // Default to predict
  return { fnName: 'predict', apiFormat: 'predict' };
}

// ────────────────────────────────────────────────────────────
// Upload file to Gradio
// ────────────────────────────────────────────────────────────

async function uploadToGradio(audioUrl: string): Promise<string | null> {
  // Download audio
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error('Failed to download audio file');
  const audioBlob = await audioResponse.blob();

  const formData = new FormData();
  formData.append('files', new File([audioBlob], 'audio.mp3', { type: audioBlob.type || 'audio/mpeg' }));

  try {
    const res = await fetch(`${WHISPERX_API_URL}/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      return data[0]; // file path on server
    }
  } catch { /* upload not supported */ }

  return null;
}

// ────────────────────────────────────────────────────────────
// Main WhisperX caller — tries multiple API formats
// ────────────────────────────────────────────────────────────

type SyncResult = Array<{
  text: string; start: number; end: number;
  words: Array<{ word: string; start: number; end: number; line_index: number }>;
}>;

async function callWhisperX(audioUrl: string, rawLyrics: string): Promise<SyncResult> {
  const errors: string[] = [];

  // Try uploading file first
  let filePath: string | null = null;
  try {
    filePath = await uploadToGradio(audioUrl);
  } catch (e) {
    errors.push(`Upload: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // Build the audio data payload for Gradio
  const audioData = filePath
    ? { path: filePath, meta: { _type: 'gradio.FileData' } }
    : { url: audioUrl };

  // Discover API format
  const { fnName, apiFormat } = await discoverAPI();
  console.log(`Gradio API: format=${apiFormat}, fn=${fnName}, filePath=${filePath ? 'yes' : 'no'}`);

  // ── Strategy 1: /api/predict (Gradio 3 style, most compatible) ──
  try {
    const result = await tryPredict(audioData, rawLyrics);
    return parseWhisperXOutput(result, rawLyrics);
  } catch (e) {
    errors.push(`/api/predict: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // ── Strategy 2: /call/{fn} (Gradio 4 style) ──
  try {
    const result = await tryCall(fnName, audioData, rawLyrics);
    return parseWhisperXOutput(result, rawLyrics);
  } catch (e) {
    errors.push(`/call/${fnName}: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // ── Strategy 3: /api/predict with fn_index ──
  try {
    const result = await tryPredictWithIndex(audioData, rawLyrics);
    return parseWhisperXOutput(result, rawLyrics);
  } catch (e) {
    errors.push(`/api/predict(fn_index): ${e instanceof Error ? e.message : 'failed'}`);
  }

  // ── Strategy 4: /run/{fn} (older Gradio) ──
  try {
    const result = await tryRun(fnName, audioData, rawLyrics);
    return parseWhisperXOutput(result, rawLyrics);
  } catch (e) {
    errors.push(`/run/${fnName}: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // ── Strategy 5: /queue/join (Gradio queue-based) ──
  try {
    const result = await tryQueue(audioData, rawLyrics);
    return parseWhisperXOutput(result, rawLyrics);
  } catch (e) {
    errors.push(`/queue: ${e instanceof Error ? e.message : 'failed'}`);
  }

  throw new Error(`All API strategies failed:\n${errors.join('\n')}`);
}

// ────────────────────────────────────────────────────────────
// API Strategy Implementations
// ────────────────────────────────────────────────────────────

async function tryPredict(audioData: unknown, lyrics: string): Promise<unknown> {
  const res = await fetch(`${WHISPERX_API_URL}/api/predict`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ data: [audioData, lyrics, 'id'] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.data?.[0] ?? data;
}

async function tryPredictWithIndex(audioData: unknown, lyrics: string): Promise<unknown> {
  const res = await fetch(`${WHISPERX_API_URL}/api/predict`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ data: [audioData, lyrics, 'id'], fn_index: 0 }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.data?.[0] ?? data;
}

async function tryCall(fnName: string, audioData: unknown, lyrics: string): Promise<unknown> {
  // POST /call/{fn}
  const callRes = await fetch(`${WHISPERX_API_URL}/call/${fnName}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ data: [audioData, lyrics, 'id'] }),
  });
  if (!callRes.ok) throw new Error(`${callRes.status} ${callRes.statusText}`);
  const callData = await callRes.json();
  const eventId = callData.event_id;
  if (!eventId) throw new Error('No event_id in response');

  // GET /call/{fn}/{event_id}
  const resultRes = await fetch(`${WHISPERX_API_URL}/call/${fnName}/${eventId}`, {
    headers: authHeaders(),
  });
  const text = await resultRes.text();
  const dataLines = text.split('\n').filter(l => l.startsWith('data:'));
  const lastData = dataLines[dataLines.length - 1];
  if (!lastData) throw new Error('No data in SSE response');
  const parsed = JSON.parse(lastData.replace('data: ', ''));
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

async function tryRun(fnName: string, audioData: unknown, lyrics: string): Promise<unknown> {
  const res = await fetch(`${WHISPERX_API_URL}/run/${fnName}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ data: [audioData, lyrics, 'id'] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.data?.[0] ?? data;
}

async function tryQueue(audioData: unknown, lyrics: string): Promise<unknown> {
  // Join queue
  const joinRes = await fetch(`${WHISPERX_API_URL}/queue/join`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ data: [audioData, lyrics, 'id'], fn_index: 0 }),
  });
  if (!joinRes.ok) throw new Error(`${joinRes.status} ${joinRes.statusText}`);
  const joinData = await joinRes.json();
  const hash = joinData.hash;
  if (!hash) throw new Error('No hash in queue response');

  // Poll for status
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`${WHISPERX_API_URL}/queue/status`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ hash }),
    });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    if (statusData.status === 'COMPLETE') {
      return statusData.data?.output?.data?.[0] ?? statusData.data?.[0] ?? statusData;
    }
    if (statusData.status === 'FAILED') throw new Error('Queue job failed');
  }
  throw new Error('Queue polling timeout');
}

// ────────────────────────────────────────────────────────────
// Parse WhisperX Output
// ────────────────────────────────────────────────────────────

function parseWhisperXOutput(output: unknown, rawLyrics: string): SyncResult {
  const lines = rawLyrics.split('\n').filter(l => l.trim());

  if (Array.isArray(output)) {
    if (output.length > 0 && output[0].text && output[0].words) return output;
    if (output.length > 0 && output[0].word !== undefined) return groupWordsIntoLines(output, lines);
  }

  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && parsed[0].word !== undefined) return groupWordsIntoLines(parsed, lines);
        if (parsed.length > 0 && parsed[0].text && parsed[0].words) return parsed;
      }
    } catch { /* not JSON */ }
  }

  if (output && typeof output === 'object' && 'segments' in output) {
    const segments = (output as { segments: Array<{ text: string; start: number; end: number; words?: Array<{ word: string; start: number; end: number }> }> }).segments;
    return segments.map((seg, i) => ({
      text: seg.text?.trim() || lines[i] || '',
      start: seg.start || 0,
      end: seg.end || 0,
      words: (seg.words || []).map(w => ({ word: w.word, start: w.start, end: w.end, line_index: i })),
    }));
  }

  throw new Error('Unexpected output format from WhisperX');
}

function groupWordsIntoLines(
  words: Array<{ word: string; start: number; end: number; line_index: number }>,
  lines: string[],
): SyncResult {
  const lineMap = new Map<number, Array<{ word: string; start: number; end: number; line_index: number }>>();
  for (const w of words) {
    if (!lineMap.has(w.line_index)) lineMap.set(w.line_index, []);
    lineMap.get(w.line_index)!.push(w);
  }
  return lines.map((text, i) => {
    const lw = lineMap.get(i) || [];
    return {
      text,
      start: lw.length > 0 ? lw[0].start : 0,
      end: lw.length > 0 ? lw[lw.length - 1].end : 0,
      words: lw,
    };
  });
}
