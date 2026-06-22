import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────
// AI Sync API Route
// Calls WhisperX on Hugging Face Spaces for forced alignment
// ────────────────────────────────────────────────────────────

const WHISPERX_API_URL = process.env.WHISPERX_API_URL || 'https://shirothol-whisperx-align.hf.space';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
);

export async function POST(request: NextRequest) {
  try {
    const { songId } = await request.json();

    if (!songId) {
      return NextResponse.json({ error: 'songId is required' }, { status: 400 });
    }

    // 1. Fetch song from database
    const { data: song, error: fetchError } = await supabaseAdmin
      .from('songs')
      .select('*')
      .eq('id', songId)
      .single();

    if (fetchError || !song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    if (!song.audio_url) {
      return NextResponse.json({ error: 'No audio file uploaded' }, { status: 400 });
    }

    if (!song.raw_lyrics || song.raw_lyrics.trim().length === 0) {
      return NextResponse.json({ error: 'No lyrics provided' }, { status: 400 });
    }

    // 2. Update status to processing
    await supabaseAdmin
      .from('songs')
      .update({ sync_status: 'processing' })
      .eq('id', songId);

    // 3. Download audio file to send to WhisperX
    const audioResponse = await fetch(song.audio_url);
    if (!audioResponse.ok) {
      await supabaseAdmin
        .from('songs')
        .update({ sync_status: 'failed' })
        .eq('id', songId);
      return NextResponse.json({ error: 'Failed to download audio file' }, { status: 500 });
    }

    const audioBlob = await audioResponse.blob();

    // 4. Call Gradio API on HF Space
    // Gradio 4+ uses the /api/predict or /call/ endpoints
    // First, try the Gradio client API format
    let syncedLyrics;

    try {
      syncedLyrics = await callGradioAPI(audioBlob, song.raw_lyrics, song.audio_url);
    } catch (apiError) {
      console.error('WhisperX API error:', apiError);
      await supabaseAdmin
        .from('songs')
        .update({ sync_status: 'failed' })
        .eq('id', songId);
      return NextResponse.json(
        { error: `AI sync failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}` },
        { status: 500 },
      );
    }

    // 5. Save results to database
    await supabaseAdmin
      .from('songs')
      .update({
        synced_lyrics: syncedLyrics,
        sync_status: 'synced',
      })
      .eq('id', songId);

    return NextResponse.json({
      success: true,
      message: 'Sinkronisasi berhasil!',
      linesCount: syncedLyrics.length,
    });
  } catch (error) {
    console.error('AI sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────────────────
// Gradio API Call
// ────────────────────────────────────────────────────────────

async function callGradioAPI(
  audioBlob: Blob,
  rawLyrics: string,
  audioUrl: string,
): Promise<Array<{ text: string; start: number; end: number; words: Array<{ word: string; start: number; end: number; line_index: number }> }>> {
  
  // Step 1: Upload audio file to Gradio
  const uploadFormData = new FormData();
  const audioFile = new File([audioBlob], 'audio.mp3', { type: audioBlob.type || 'audio/mpeg' });
  uploadFormData.append('files', audioFile);

  const uploadRes = await fetch(`${WHISPERX_API_URL}/upload`, {
    method: 'POST',
    body: uploadFormData,
  });

  if (!uploadRes.ok) {
    // Fallback: try sending the URL directly instead of uploading
    return callGradioWithURL(audioUrl, rawLyrics);
  }

  const uploadData = await uploadRes.json();
  const uploadedFilePath = uploadData[0]; // Gradio returns array of file paths

  // Step 2: Call the predict endpoint
  const predictRes = await fetch(`${WHISPERX_API_URL}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [
        { path: uploadedFilePath, meta: { _type: 'gradio.FileData' } }, // audio
        rawLyrics, // lyrics text
        'id', // language (Indonesian)
      ],
    }),
  });

  if (!predictRes.ok) {
    // Try alternative Gradio API format
    return callGradioAlternative(uploadedFilePath, rawLyrics);
  }

  const predictData = await predictRes.json();
  return parseWhisperXOutput(predictData.data[0], rawLyrics);
}

async function callGradioWithURL(
  audioUrl: string,
  rawLyrics: string,
): Promise<Array<{ text: string; start: number; end: number; words: Array<{ word: string; start: number; end: number; line_index: number }> }>> {
  
  // Try the /call/ endpoint (Gradio 4+ format)
  const callRes = await fetch(`${WHISPERX_API_URL}/call/align_lyrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [
        { url: audioUrl },
        rawLyrics,
        'id',
      ],
    }),
  });

  if (!callRes.ok) {
    throw new Error(`Gradio /call/ endpoint failed: ${callRes.status} ${callRes.statusText}`);
  }

  const callData = await callRes.json();
  const eventId = callData.event_id;

  // Poll for result using SSE
  const resultRes = await fetch(`${WHISPERX_API_URL}/call/align_lyrics/${eventId}`);
  const resultText = await resultRes.text();
  
  // Parse SSE response — look for "data:" lines
  const dataLines = resultText.split('\n').filter(l => l.startsWith('data:'));
  const lastData = dataLines[dataLines.length - 1];
  
  if (!lastData) {
    throw new Error('No data received from Gradio');
  }

  const parsed = JSON.parse(lastData.replace('data: ', ''));
  return parseWhisperXOutput(parsed[0], rawLyrics);
}

async function callGradioAlternative(
  filePath: string,
  rawLyrics: string,
): Promise<Array<{ text: string; start: number; end: number; words: Array<{ word: string; start: number; end: number; line_index: number }> }>> {
  
  // Try the /call/ endpoint
  const callRes = await fetch(`${WHISPERX_API_URL}/call/align_lyrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [
        { path: filePath, meta: { _type: 'gradio.FileData' } },
        rawLyrics,
        'id',
      ],
    }),
  });

  if (!callRes.ok) {
    throw new Error(`Gradio API failed with status ${callRes.status}`);
  }

  const callData = await callRes.json();
  const eventId = callData.event_id;

  // Fetch the SSE result
  const resultRes = await fetch(`${WHISPERX_API_URL}/call/align_lyrics/${eventId}`);
  const resultText = await resultRes.text();

  const dataLines = resultText.split('\n').filter(l => l.startsWith('data:'));
  const lastData = dataLines[dataLines.length - 1];

  if (!lastData) {
    throw new Error('No data received from Gradio');
  }

  const parsed = JSON.parse(lastData.replace('data: ', ''));
  return parseWhisperXOutput(parsed[0], rawLyrics);
}

// ────────────────────────────────────────────────────────────
// Parse WhisperX Output into SyncedLine[] format
// ────────────────────────────────────────────────────────────

function parseWhisperXOutput(
  output: unknown,
  rawLyrics: string,
): Array<{ text: string; start: number; end: number; words: Array<{ word: string; start: number; end: number; line_index: number }> }> {
  
  const lines = rawLyrics.split('\n').filter(l => l.trim());

  // If output is already our expected format (array of SyncedWord)
  if (Array.isArray(output)) {
    // Check if it's already SyncedLine format
    if (output.length > 0 && output[0].text && output[0].words) {
      return output;
    }

    // Check if it's SyncedWord[] format (flat)
    if (output.length > 0 && output[0].word !== undefined) {
      return groupWordsIntoLines(output, lines);
    }
  }

  // If output is a JSON string
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && parsed[0].word !== undefined) {
          return groupWordsIntoLines(parsed, lines);
        }
        if (parsed.length > 0 && parsed[0].text && parsed[0].words) {
          return parsed;
        }
      }
    } catch {
      // Not valid JSON
    }
  }

  // If output is an object with segments
  if (output && typeof output === 'object' && 'segments' in output) {
    const segments = (output as { segments: Array<{ text: string; start: number; end: number; words?: Array<{ word: string; start: number; end: number }> }> }).segments;
    return segments.map((seg, i) => ({
      text: seg.text?.trim() || lines[i] || '',
      start: seg.start || 0,
      end: seg.end || 0,
      words: (seg.words || []).map(w => ({
        word: w.word,
        start: w.start,
        end: w.end,
        line_index: i,
      })),
    }));
  }

  throw new Error('Unexpected output format from WhisperX');
}

function groupWordsIntoLines(
  words: Array<{ word: string; start: number; end: number; line_index: number }>,
  lines: string[],
): Array<{ text: string; start: number; end: number; words: Array<{ word: string; start: number; end: number; line_index: number }> }> {
  
  const lineMap = new Map<number, Array<{ word: string; start: number; end: number; line_index: number }>>();

  for (const w of words) {
    const idx = w.line_index;
    if (!lineMap.has(idx)) lineMap.set(idx, []);
    lineMap.get(idx)!.push(w);
  }

  const result: Array<{ text: string; start: number; end: number; words: Array<{ word: string; start: number; end: number; line_index: number }> }> = [];

  for (let i = 0; i < lines.length; i++) {
    const lineWords = lineMap.get(i) || [];
    result.push({
      text: lines[i],
      start: lineWords.length > 0 ? lineWords[0].start : 0,
      end: lineWords.length > 0 ? lineWords[lineWords.length - 1].end : 0,
      words: lineWords,
    });
  }

  return result;
}
