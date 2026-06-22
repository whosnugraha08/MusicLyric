// ════════════════════════════════════════════════════════════
// LyricStage — Shared Type Definitions
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// Sync Status
// ────────────────────────────────────────────────────────────

export type SyncStatus =
  | "unsynced"
  | "processing"
  | "synced"
  | "needs_correction"
  | "failed";

// ────────────────────────────────────────────────────────────
// Synced Lyrics Types
// ────────────────────────────────────────────────────────────

/** A single word with precise start/end timestamps (in seconds). */
export interface SyncedWord {
  word: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Zero-based index of the line this word belongs to */
  line_index: number;
}

/** A full lyric line composed of timed words. */
export interface SyncedLine {
  /** The complete text of this line */
  text: string;
  /** Start time of the first word (seconds) */
  start: number;
  /** End time of the last word (seconds) */
  end: number;
  /** Individual timed words within this line */
  words: SyncedWord[];
}

// ────────────────────────────────────────────────────────────
// Song
// ────────────────────────────────────────────────────────────

/** Database row for the `songs` table. */
export interface Song {
  id: string;
  title: string;
  artist: string;
  audio_url: string | null;
  cover_url: string | null;
  raw_lyrics: string | null;
  synced_lyrics: SyncedLine[] | null;
  sync_status: SyncStatus;
  duration: number | null;
  created_at: string;
  updated_at: string;
}

/** Fields accepted when creating a new song (omitting generated columns). */
export type SongInsert = Omit<Song, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

/** Fields accepted when updating an existing song. */
export type SongUpdate = Partial<Omit<Song, "id" | "created_at">>;

// ────────────────────────────────────────────────────────────
// Layout Types
// ────────────────────────────────────────────────────────────

export type LayoutType =
  | "fullscreen"
  | "split"
  | "compact"
  | "minimal";

// ────────────────────────────────────────────────────────────
// Theme Types
// ────────────────────────────────────────────────────────────

export type ThemeType =
  | "dark"
  | "light"
  | "auto"
  | "vibrant";

// ────────────────────────────────────────────────────────────
// Color Extraction Result
// ────────────────────────────────────────────────────────────

export interface ExtractedColors {
  /** Dominant / primary color (hex) */
  primary: string;
  /** Secondary accent color (hex) */
  secondary: string;
  /** Highlight / accent color (hex) */
  accent: string;
  /** CSS gradient string built from the extracted palette */
  gradient: string;
}
