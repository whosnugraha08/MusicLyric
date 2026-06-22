import Vibrant from "node-vibrant";
import type { ExtractedColors } from "@/lib/types";

// ────────────────────────────────────────────────────────────
// Default fallback palette (dark purple / indigo)
// ────────────────────────────────────────────────────────────

const DEFAULT_COLORS: ExtractedColors = {
  primary: "#1a1a2e",
  secondary: "#16213e",
  accent: "#e94560",
  gradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Convert an rgb array to a hex string. */
function rgbToHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((c) => {
        const hex = Math.round(c).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

/**
 * Build a CSS linear-gradient from an array of hex colours.
 * Distributes stops evenly across 135 degrees.
 */
function buildGradient(colors: string[]): string {
  if (colors.length === 0) return DEFAULT_COLORS.gradient;
  if (colors.length === 1) return `linear-gradient(135deg, ${colors[0]}, ${colors[0]})`;

  const step = 100 / (colors.length - 1);
  const stops = colors.map((c, i) => `${c} ${Math.round(i * step)}%`).join(", ");
  return `linear-gradient(135deg, ${stops})`;
}

// ────────────────────────────────────────────────────────────
// Main extraction function
// ────────────────────────────────────────────────────────────

/**
 * Extract dominant colours from an image URL (album cover art).
 *
 * Uses node-vibrant to pull a palette and maps swatches to
 * primary / secondary / accent roles.
 *
 * @param imageUrl - A publicly-accessible image URL.
 * @returns Extracted colour palette or the default fallback.
 */
export async function extractColors(
  imageUrl: string
): Promise<ExtractedColors> {
  try {
    const palette = await Vibrant.from(imageUrl)
      .quality(3) // 1 = best quality, 5 = fastest
      .getPalette();

    // Pick swatches with sensible fallback priority
    const primarySwatch =
      palette.Vibrant ?? palette.DarkVibrant ?? palette.Muted ?? null;
    const secondarySwatch =
      palette.DarkVibrant ?? palette.DarkMuted ?? palette.Muted ?? null;
    const accentSwatch =
      palette.LightVibrant ?? palette.Vibrant ?? palette.LightMuted ?? null;

    if (!primarySwatch) {
      return DEFAULT_COLORS;
    }

    const primary = rgbToHex(primarySwatch.rgb as [number, number, number]);
    const secondary = secondarySwatch
      ? rgbToHex(secondarySwatch.rgb as [number, number, number])
      : primary;
    const accent = accentSwatch
      ? rgbToHex(accentSwatch.rgb as [number, number, number])
      : primary;

    const gradient = buildGradient([primary, secondary, accent]);

    return { primary, secondary, accent, gradient };
  } catch (error) {
    console.error("[color-extract] Failed to extract colors:", error);
    return DEFAULT_COLORS;
  }
}

/**
 * Returns the default fallback colour palette.
 * Useful when no cover art is available.
 */
export function getDefaultColors(): ExtractedColors {
  return { ...DEFAULT_COLORS };
}
