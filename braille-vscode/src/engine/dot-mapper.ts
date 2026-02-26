// ============================================================
// Dot Mapper: Converts dot chord → character based on current mode
// ============================================================

import { DotNumber, Mode, UnifiedEntry, DotMapping } from "../data/types";
import { UnifiedData } from "../data/unified-table";

/**
 * Converts a set of dots into a printable character
 * using the unified data table and the current mode.
 */
export class DotMapper {
  private data: UnifiedData | null = null;

  /**
   * Set the unified data (call once after loading profiles).
   */
  setData(data: UnifiedData): void {
    this.data = data;
  }

  /**
   * Convert a set of dots to a dots key string.
   * e.g., Set(1, 2, 4) → "124"
   */
  dotsToKey(dots: Set<DotNumber>): string {
    const sorted = Array.from(dots)
      .filter(d => d > 0)
      .sort((a, b) => a - b);
    return sorted.join("");
  }

  /**
   * Look up a single-cell chord in the unified table.
   * Returns the mapping for the given mode, falling back to grade1.
   */
  lookup(dotsKey: string, mode: Mode): DotMapping | null {
    if (!this.data) {
      return null;
    }

    const entry = this.data.singleCellMap.get(dotsKey);
    if (!entry) {
      return null;
    }

    // Try current mode first, then fall back to grade1
    return entry.mappings[mode] || entry.mappings["grade1"] || null;
  }

  /**
   * Look up a single-cell chord in the numeric map.
   * Used after the numeric indicator to resolve digits.
   */
  lookupNumeric(dotsKey: string): DotMapping | null {
    if (!this.data) {
      return null;
    }
    return this.data.numericMap.get(dotsKey) || null;
  }

  /**
   * Convert dots to a Unicode braille character (U+2800-U+28FF).
   * Used for braille preview display.
   */
  dotsToUnicodeBraille(dots: Set<DotNumber>): string {
    const dotBits: Record<number, number> = {
      1: 0x01,
      2: 0x02,
      3: 0x04,
      4: 0x08,
      5: 0x10,
      6: 0x20
    };
    let bitmask = 0;
    for (const d of dots) {
      if (d > 0 && dotBits[d]) {
        bitmask |= dotBits[d];
      }
    }
    return String.fromCharCode(0x2800 + bitmask);
  }

  /**
   * Convert a dots key string to Unicode braille character.
   */
  dotsKeyToUnicodeBraille(dotsKey: string): string {
    const dotBits: Record<string, number> = {
      "1": 0x01,
      "2": 0x02,
      "3": 0x04,
      "4": 0x08,
      "5": 0x10,
      "6": 0x20
    };
    let bitmask = 0;
    for (const ch of dotsKey) {
      if (dotBits[ch]) {
        bitmask |= dotBits[ch];
      }
    }
    return String.fromCharCode(0x2800 + bitmask);
  }
}
