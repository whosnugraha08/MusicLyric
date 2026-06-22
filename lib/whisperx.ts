import type { SyncedWord, SyncedLine } from './types';

const WHISPERX_API_URL = process.env.NEXT_PUBLIC_WHISPERX_API_URL || 'https://shirothol-whisperx-align.hf.space';

// The browser doesn't have process.env.HF_TOKEN, but the space is public anyway.
// We can use a token if passed, but it's optional.
function authHeaders(): Record<string, string> {
  // If the user exposes the token to the browser (not recommended), we could use it.
  // But public spaces don't need it.
  return {};
}

export async function processWhisperXSync(audioUrl: string, rawLyrics: string, onProgress?: (msg: string) => void): Promise<SyncedLine[]> {
  onProgress?.('Mengunduh audio...');
  
  // 1. Download audio to blob
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error('Gagal mengunduh file audio');
  const audioBlob = await audioResponse.blob();

  // 2. Upload to Gradio
  onProgress?.('Mengunggah ke Hugging Face...');
  const filePath = await uploadToGradio(audioBlob);

  // 3. Call /gradio_api/call/v2/align_lyrics
  onProgress?.('Memproses AI Alignment (ini bisa memakan waktu 1-3 menit)...');
  const callRes = await fetch(`${WHISPERX_API_URL}/gradio_api/call/v2/align_lyrics`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
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
    throw new Error(`Gradio call failed (${callRes.status}): ${errText.slice(0, 200)}`);
  }

  const callText = await callRes.text();
  let callData: any;
  try {
    callData = JSON.parse(callText);
  } catch {
    throw new Error(`Gradio call response is not JSON: ${callText.slice(0, 200)}`);
  }
  
  const eventId = callData.event_id;
  if (!eventId) throw new Error(`No event_id in response: ${callText.slice(0, 200)}`);

  // 4. Poll via SSE
  onProgress?.('Menunggu hasil dari AI...');
  const resultRes = await fetch(`${WHISPERX_API_URL}/gradio_api/call/align_lyrics/${eventId}`, {
    headers: authHeaders(),
  });

  const resultText = await resultRes.text();
  const dataLines = resultText.split('\n').filter(l => l.startsWith('data:'));
  const lastData = dataLines[dataLines.length - 1];

  if (!lastData) {
    const errorLines = resultText.split('\n').filter(l => l.includes('error'));
    throw new Error(`Gagal mendapatkan hasil dari server. Event: ${errorLines.join('; ') || resultText.slice(0, 200)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(lastData.replace(/^data:\s*/, ''));
  } catch {
    throw new Error(`Gagal parsing hasil AI: ${lastData.slice(0, 200)}`);
  }

  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(`WhisperX error: ${parsed.error?.slice(0, 200)}`);
  }

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
    throw new Error(`Upload failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const uploadText = await res.text();
  let data: any;
  try {
    data = JSON.parse(uploadText);
  } catch {
    throw new Error(`Upload response not JSON: ${uploadText.slice(0, 200)}`);
  }

  return Array.isArray(data) ? data[0] : data;
}

function parseWhisperXOutput(output: any, rawLyrics: string): SyncedLine[] {
  const lines = rawLyrics.split('\n').filter(l => l.trim());
  const outputStr = JSON.stringify(output).slice(0, 300);

  let data = output;
  if (Array.isArray(data) && data.length === 1) data = data[0];

  if (Array.isArray(data)) {
    if (data.length > 0 && data[0].text !== undefined && data[0].start !== undefined) {
      return data.map((item, i) => ({
        text: item.text?.trim() || lines[i] || '',
        start: item.start || 0,
        end: item.end || 0,
        words: Array.isArray(item.words) ? item.words.map((w: any) => ({
          word: w.word, start: w.start, end: w.end, line_index: item.line_index ?? i,
        })) : [],
      }));
    }
    if (data.length > 0 && data[0].word !== undefined) {
      return groupWordsIntoLines(data, lines);
    }
  }

  if (typeof data === 'string') {
    try {
      return parseWhisperXOutput(JSON.parse(data), rawLyrics);
    } catch { /* not JSON */ }
  }

  if (data && typeof data === 'object') {
    if ('segments' in data) {
      return data.segments.map((seg: any, i: number) => ({
        text: seg.text?.trim() || lines[i] || '',
        start: seg.start || 0,
        end: seg.end || 0,
        words: (seg.words || []).map((w: any) => ({ word: w.word, start: w.start, end: w.end, line_index: i })),
      }));
    }
    if ('word_segments' in data) {
      return groupWordsIntoLines(data.word_segments.map((w: any) => ({ ...w, line_index: 0 })), lines);
    }
  }

  throw new Error(`Format output WhisperX tidak dikenali: ${outputStr}`);
}

function groupWordsIntoLines(words: any[], lines: string[]): SyncedLine[] {
  if (words.length > 0 && words[0].line_index === undefined) {
    let wordIdx = 0;
    const result: SyncedLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const lineWords: SyncedWord[] = [];
      const lineTokens = lines[i].toLowerCase().split(/\s+/).filter(Boolean);
      for (let t = 0; t < lineTokens.length && wordIdx < words.length; t++, wordIdx++) {
        lineWords.push({ word: words[wordIdx].word, start: words[wordIdx].start, end: words[wordIdx].end, line_index: i });
      }
      result.push({
        text: lines[i],
        start: lineWords.length > 0 ? lineWords[0].start : (result.length > 0 ? result[result.length - 1].end : 0),
        end: lineWords.length > 0 ? lineWords[lineWords.length - 1].end : (result.length > 0 ? result[result.length - 1].end : 0),
        words: lineWords,
      });
    }
    return result;
  }

  const lineMap = new Map<number, SyncedWord[]>();
  for (const w of words) {
    const idx = w.line_index ?? 0;
    if (!lineMap.has(idx)) lineMap.set(idx, []);
    lineMap.get(idx)!.push({ word: w.word, start: w.start, end: w.end, line_index: idx });
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
