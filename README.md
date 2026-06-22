# LyricStage

Personal Lyric Video Studio — Web app untuk membuat lyric video estetik dari koleksi lagu sendiri, dengan AI forced alignment dan tampilan ala Spotify/Apple Music Lyrics.

## Features

- 🎵 **Music Library** — Upload dan kelola koleksi lagu dengan cover art
- 🤖 **AI Auto-Sync** — Sinkronisasi lirik otomatis via WhisperX (Hugging Face Spaces)
- 👆 **Manual Tap-to-Sync** — Sinkronisasi manual dengan mengetuk baris per baris
- ✏️ **Sync Editor** — Koreksi timestamp dengan editor visual
- 🎬 **Lyric Video Player** — Tampilan lyric video Tipe A (Streaming Classic) dengan background dinamis
- 📱 **Responsive** — Support landscape (16:9) dan vertikal (9:16) untuk Reels/Shorts
- 🖥️ **Presentation Mode** — Fullscreen mode untuk screen recording

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS v3
- **Database**: Supabase PostgreSQL
- **Storage**: Supabase Storage
- **Language**: TypeScript
- **Color Extraction**: node-vibrant

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (free tier)

### Setup

1. Clone repository:
   ```bash
   git clone https://github.com/YourUsername/MusicLyric.git
   cd MusicLyric
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your Supabase credentials.

4. Setup Supabase database:
   - Run the SQL in `supabase/schema.sql` in your Supabase SQL Editor
   - Create storage buckets: `audio` and `covers` (set to public)

5. Run development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

### AI Sync Setup (Optional)

See [docs/WHISPERX_SETUP.md](docs/WHISPERX_SETUP.md) for setting up WhisperX on Hugging Face Spaces.

## Roadmap

- [x] Fase 1 — MVP (Library, Manual Sync, Tipe A Player)
- [ ] Fase 2 — Variasi Tema (Kinetic Typography, Minimalist Karaoke, Vinyl)
- [ ] Fase 3 — Portofolio & Showcase

## License

Private / Personal Use
