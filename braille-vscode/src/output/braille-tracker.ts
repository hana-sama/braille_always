// ============================================================
// Braille Tracker: Maintains a parallel record of braille dots
// for every character inserted into the editor.
// ============================================================

import { DotMapper } from "../engine/dot-mapper";

/**
 * Tracks the dotsKey for every character inserted, maintaining
 * a per-line array of braille dot strings. Used by BrailleOverlay
 * to render Unicode braille decorations alongside print text.
 */
export class BrailleTracker {
  /**
   * Per-line storage: lineData[lineNumber] = array of dotsKey strings.
   * Each entry corresponds to one character on that line.
   * A space is stored as "" (empty string).
   */
  private lineData: Map<number, string[]> = new Map();
  private dotMapper: DotMapper;

  constructor(dotMapper: DotMapper) {
    this.dotMapper = dotMapper;
  }

  /**
   * Record a braille cell at the given line and column.
   */
  record(line: number, col: number, dotsKey: string): void {
    let arr = this.lineData.get(line);
    if (!arr) {
      arr = [];
      this.lineData.set(line, arr);
    }

    // Extend array if needed (fill gaps with empty strings)
    while (arr.length <= col) {
      arr.push("");
    }
    arr[col] = dotsKey;
  }

  /**
   * Record a space at the given line and column.
   */
  recordSpace(line: number, col: number): void {
    this.record(line, col, "");
  }

  /**
   * Get the Unicode braille string for a given line.
   * Spaces map to braille space (U+2800), non-empty dotsKeys
   * are converted via DotMapper.
   */
  getLine(line: number): string {
    const arr = this.lineData.get(line);
    if (!arr || arr.length === 0) {
      return "";
    }

    return arr
      .map(dotsKey => {
        if (dotsKey === "") {
          // Braille space: ⠀ (U+2800)
          return "\u2800";
        }
        return this.dotMapper.dotsKeyToUnicodeBraille(dotsKey);
      })
      .join("");
  }

  /**
   * Check if any data exists for a line.
   */
  hasLine(line: number): boolean {
    return this.lineData.has(line) && this.lineData.get(line)!.length > 0;
  }

  /**
   * Get all line numbers that have data.
   */
  getTrackedLines(): number[] {
    return Array.from(this.lineData.keys()).sort((a, b) => a - b);
  }

  /**
   * Clear all tracking data.
   */
  clear(): void {
    this.lineData.clear();
  }
}
