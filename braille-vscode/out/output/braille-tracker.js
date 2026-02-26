"use strict";
// ============================================================
// Braille Tracker: Maintains a parallel record of braille dots
// for every character inserted into the editor.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrailleTracker = void 0;
/**
 * Tracks the dotsKey for every character inserted, maintaining
 * a per-line array of braille dot strings. Used by BrailleOverlay
 * to render Unicode braille decorations alongside print text.
 */
class BrailleTracker {
    constructor(dotMapper) {
        /**
         * Per-line storage: lineData[lineNumber] = array of dotsKey strings.
         * Each entry corresponds to one character on that line.
         * A space is stored as "" (empty string).
         */
        this.lineData = new Map();
        this.dotMapper = dotMapper;
    }
    /**
     * Record a braille cell at the given line and column.
     */
    record(line, col, dotsKey) {
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
    recordSpace(line, col) {
        this.record(line, col, "");
    }
    /**
     * Get the Unicode braille string for a given line.
     * Spaces map to braille space (U+2800), non-empty dotsKeys
     * are converted via DotMapper.
     */
    getLine(line) {
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
    hasLine(line) {
        return this.lineData.has(line) && this.lineData.get(line).length > 0;
    }
    /**
     * Get all line numbers that have data.
     */
    getTrackedLines() {
        return Array.from(this.lineData.keys()).sort((a, b) => a - b);
    }
    /**
     * Clear all tracking data.
     */
    clear() {
        this.lineData.clear();
    }
}
exports.BrailleTracker = BrailleTracker;
//# sourceMappingURL=braille-tracker.js.map