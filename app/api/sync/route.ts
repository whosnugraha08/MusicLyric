import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import { createClient } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────
// AI Sync API Route — Gradio 6 (shiroThol/whisperx-align)
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
// Gradio 6 API — /gradio_api/*
// ────────────────────────────────────────────────────────────

type SyncResult = Array<{
  text: string; start: number; end: number;
  words: Array<{ word: string; start: number; end: number; line_index: number }>;
}>;

async function callWhisperX(audioUrl: string, rawLyrics: string): Promise<SyncResult> {
  // Step 1: Download audio
  console.log('[WhisperX] Downloading audio...');
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error('Failed to download audio file');
  const audioBlob = await audioResponse.blob();

  // Step 2: Upload to Gradio
  console.log('[WhisperX] Uploading to Gradio...');
  const filePath = await uploadToGradio(audioBlob);

  // Step 3: Call /gradio_api/call/v2/align_lyrics with named params
  console.log('[WhisperX] Calling align_lyrics...');
  const callRes = await fetch(`${WHISPERX_API_URL}/gradio_api/call/v2/align_lyrics`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      audio_file: {
        path: filePath,
        meta: { _type: 'gradio.FileData' },
      },
      lyrics_text: rawLyrics,
      language: 'id',
    }),
  });

  if (!callRes.ok) {
    const errText = await callRes.text();
    throw new Error(`Gradio /call/v2/ failed (${callRes.status}): ${errText.slice(0, 200)}`);
  }

  const callData = await callRes.json();
  const eventId = callData.event_id;
  if (!eventId) throw new Error('No event_id in Gradio response');

  // Step 4: Poll for result via SSE
  console.log(`[WhisperX] Polling event ${eventId}...`);
  const resultRes = await fetch(`${WHISPERX_API_URL}/gradio_api/call/align_lyrics/${eventId}`, {
    headers: authHeaders(),
  });

  const resultText = await resultRes.text();
  console.log('[WhisperX] Raw SSE response length:', resultText.length);

  // Parse SSE — look for "data:" lines
  const dataLines = resultText.split('\n').filter(l => l.startsWith('data:'));
  const lastData = dataLines[dataLines.length - 1];

  if (!lastData) {
    // Check for error event
    const errorLines = resultText.split('\n').filter(l => l.includes('error'));
    throw new Error(`No data in SSE response. Events: ${errorLines.join('; ') || resultText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(lastData.replace(/^data:\s*/, ''));
  console.log('[WhisperX] Parsed response type:', typeof parsed, Array.isArray(parsed) ? `array[${parsed.length}]` : '');

  // The response is the JSON output from the Gradio function
  // It could be wrapped in an array or be the direct result
  const output = Array.isArray(parsed) ? parsed[0] : parsed;

  return parseWhisperXOutput(output, rawLyrics);
}

async function uploadToGradio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('files', new File([audioBlob], 'audio.mp3', { type: audioBlob.type || 'audio/mpeg' }));

  const res = await fetch(`${WHISPERX_API_URL}/gradio_api/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gradio upload failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  // Returns array of file paths like ["/tmp/gradio/xxx/audio.mp3"]
  const filePath = Array.isArray(data) ? data[0] : data;
  console.log('[WhisperX] Uploaded file path:', filePath);
  return filePath;
}

// ────────────────────────────────────────────────────────────
// Parse WhisperX Output
// ────────────────────────────────────────────────────────────

function parseWhisperXOutput(output: unknown, rawLyrics: string): SyncResult {
  const lines = rawLyrics.split('\n').filter(l => l.trim());

  // Already in SyncedLine[] format
  if (Array.isArray(output)) {
    if (output.length > 0 && output[0].text && output[0].words) return output;
    if (output.length > 0 && output[0].word !== undefined) return groupWordsIntoLines(output, lines);
  }

  // JSON string
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && parsed[0].word !== undefined) return groupWordsIntoLines(parsed, lines);
        if (parsed.length > 0 && parsed[0].text && parsed[0].words) return parsed;
      }
    } catch { /* not JSON */ }
  }

  // Object with segments
  if (output && typeof output === 'object' && 'segments' in output) {
    const segments = (output as { segments: Array<{ text: string; start: number; end: number; words?: Array<{ word: string; start: number; end: number }> }> }).segments;
    return segments.map((seg, i) => ({
      text: seg.text?.trim() || lines[i] || '',
      start: seg.start || 0,
      end: seg.end || 0,
      words: (seg.words || []).map(w => ({ word: w.word, start: w.start, end: w.end, line_index: i })),
    }));
  }

  console.error('[WhisperX] Unexpected output:', JSON.stringify(output).slice(0, 500));
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
