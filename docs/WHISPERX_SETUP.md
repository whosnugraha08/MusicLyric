# WhisperX Setup Guide — Hugging Face Spaces

Panduan ini menjelaskan cara meng-setup WhisperX sebagai layanan AI forced alignment gratis di Hugging Face Spaces, untuk diintegrasikan dengan LyricStage.

## Apa itu WhisperX?

WhisperX adalah tool open-source yang menggunakan model wav2vec2 untuk melakukan **forced alignment** — mencocokkan teks lirik yang sudah diketahui ke audio, menghasilkan timestamp per kata/baris.

## Langkah Setup

### 1. Buat Akun Hugging Face

1. Kunjungi [huggingface.co](https://huggingface.co)
2. Klik **Sign Up** dan buat akun gratis
3. Verifikasi email

### 2. Buat Space Baru

1. Kunjungi [huggingface.co/new-space](https://huggingface.co/new-space)
2. Isi detail:
   - **Owner**: akun kamu
   - **Space name**: `whisperx-align` (atau nama lain)
   - **License**: MIT
   - **SDK**: pilih **Gradio**
   - **Hardware**: pilih **ZeroGPU** (gratis, dibatasi kuota harian)
3. Klik **Create Space**

### 3. Upload Kode WhisperX

Buat file `app.py` di Space dengan konten berikut:

```python
import gradio as gr
import whisperx
import torch
import json
import tempfile
import os

device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"

def align_lyrics(audio_file, lyrics_text, language="id"):
    """
    Forced alignment: mencocokkan teks lirik ke audio.
    
    Args:
        audio_file: path ke file audio
        lyrics_text: teks lirik (satu baris per line)
        language: kode bahasa ('id' untuk Indonesia, 'en' untuk English)
    
    Returns:
        JSON dengan timestamp per kata dan per baris
    """
    try:
        # Load audio
        audio = whisperx.load_audio(audio_file)
        
        # Create segments from lyrics lines
        lines = [l.strip() for l in lyrics_text.strip().split('\n') if l.strip()]
        
        # Use whisper to get initial transcription for alignment
        model = whisperx.load_model("large-v3", device, compute_type=compute_type)
        result = model.transcribe(audio, batch_size=16, language=language)
        
        # Override transcription with provided lyrics
        # This forces alignment to our known text
        segments = []
        for i, line in enumerate(lines):
            segments.append({
                "text": line,
                "start": 0,
                "end": 0,
            })
        
        result["segments"] = segments
        
        # Forced alignment
        model_a, metadata = whisperx.load_align_model(
            language_code=language, 
            device=device
        )
        result = whisperx.align(
            result["segments"], 
            model_a, 
            metadata, 
            audio, 
            device, 
            return_char_alignments=False
        )
        
        # Format output
        output = []
        for seg_idx, segment in enumerate(result["segments"]):
            if "words" in segment:
                for word_info in segment["words"]:
                    output.append({
                        "word": word_info.get("word", ""),
                        "start": round(word_info.get("start", 0), 3),
                        "end": round(word_info.get("end", 0), 3),
                        "line_index": seg_idx,
                    })
            else:
                # Fallback: whole line as one entry
                output.append({
                    "word": segment.get("text", ""),
                    "start": round(segment.get("start", 0), 3),
                    "end": round(segment.get("end", 0), 3),
                    "line_index": seg_idx,
                })
        
        return json.dumps(output, ensure_ascii=False, indent=2)
    
    except Exception as e:
        return json.dumps({"error": str(e)})

# Gradio Interface
demo = gr.Interface(
    fn=align_lyrics,
    inputs=[
        gr.Audio(type="filepath", label="Upload Audio"),
        gr.Textbox(
            label="Lirik (satu baris per line)", 
            lines=10,
            placeholder="Baris pertama lirik\nBaris kedua lirik\n..."
        ),
        gr.Dropdown(
            choices=["id", "en", "ms"], 
            value="id", 
            label="Bahasa"
        ),
    ],
    outputs=gr.JSON(label="Hasil Alignment (JSON)"),
    title="WhisperX Forced Alignment",
    description="Upload audio dan lirik untuk mendapatkan timestamp per kata.",
)

demo.launch()
```

### 4. Buat `requirements.txt`

```
whisperx
gradio
torch
torchaudio
```

### 5. Deploy & Tunggu

1. Commit kedua file di Space
2. Space akan otomatis build dan deploy (3-5 menit pertama kali)
3. Setelah aktif, kamu bisa test langsung di web UI Space

### 6. Integrasi dengan LyricStage

1. Catat URL Space kamu, misalnya: `https://username-whisperx-align.hf.space`
2. Tambahkan ke `.env.local`:
   ```
   WHISPERX_API_URL=https://username-whisperx-align.hf.space/api/predict
   ```
3. LyricStage akan otomatis menggunakan endpoint ini saat klik "Sinkronkan dengan AI"

## Catatan Penting

### Kuota ZeroGPU
- Tier gratis memberikan kuota GPU terbatas per hari
- Cukup untuk memproses beberapa lagu per hari
- Jika kuota habis, Space otomatis pakai CPU (lebih lambat tapi tetap gratis)
- Kuota reset setiap hari

### Cold Start
- Jika Space tidak dipakai beberapa waktu, ia "tidur"
- Request pertama butuh 30-60 detik untuk warm up
- Setelah aktif, request berikutnya cepat

### Bahasa yang Didukung
- **Indonesia** (`id`): didukung via model multilingual
- **English** (`en`): dukungan terbaik
- **Campuran ID-EN**: gunakan `id` sebagai base language, biasanya cukup akurat

### Troubleshooting
- Jika alignment tidak akurat: gunakan Manual Tap-to-Sync sebagai fallback
- Jika Space error: cek logs di tab "Logs" pada halaman Space
- Jika audio terlalu noisy: coba bersihkan audio dulu sebelum upload
