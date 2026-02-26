"use strict";
// ============================================================
// Multi-Cell Matcher: Matches multi-cell sequences (punctuation, symbols)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiCellMatcher = void 0;
/**
 * Matches incoming dot chords against known multi-cell sequences.
 * Buffers cells and checks for prefix/exact matches, similar to
 * IndicatorMatcher but for character output (punctuation, symbols, etc).
 *
 * Flow:
 *   1. Each cell is pushed via tryMatch()
 *   2. If the buffered cells form an exact match → return it
 *   3. If the buffered cells are a prefix of a longer sequence → pending
 *   4. If no match is possible → flush buffered cells for single-cell fallback
 */
class MultiCellMatcher {
    constructor() {
        this.entries = [];
        this.pendingCells = [];
        this.maxCells = 1;
    }
    /**
     * Load multi-cell entry definitions.
     */
    setEntries(entries) {
        this.entries = entries;
        this.maxCells = Math.max(1, ...entries.map(e => e.dots.length));
    }
    /**
     * Try to match a chord (as dotsKey) against multi-cell sequences.
     * Only considers entries matching the current mode.
     */
    tryMatch(dotsKey, mode) {
        this.pendingCells.push(dotsKey);
        const pendingKey = this.pendingCells.join("|");
        // Filter entries relevant to this mode
        const modeEntries = this.entries.filter(e => e.mode === mode || e.mode === "grade1");
        // Check for exact match
        const exact = modeEntries.find(e => e.dotsKey === pendingKey);
        // Check for partial match (prefix of some longer entry)
        const hasLongerPrefix = modeEntries.some(e => e.dotsKey.startsWith(pendingKey + "|"));
        if (exact && !hasLongerPrefix) {
            // Unambiguous exact match — commit immediately
            this.pendingCells = [];
            return { type: "matched", entry: exact };
        }
        if (exact && hasLongerPrefix) {
            // Ambiguous: exact match exists, but longer entry also possible.
            // For multi-cell characters we prefer the exact match immediately,
            // since most multi-cell sequences don't overlap.
            // However, if the pending cells are shorter than maxCells, defer.
            if (this.pendingCells.length < this.maxCells) {
                return { type: "pending" };
            }
            // At max cells, commit the exact match
            this.pendingCells = [];
            return { type: "matched", entry: exact };
        }
        if (!exact && hasLongerPrefix && this.pendingCells.length < this.maxCells) {
            // No exact match yet, but could become one — keep pending
            return { type: "pending" };
        }
        // No match possible. Check if dropping the last cell recovers a match
        // (the last cell might be the start of a new sequence or a single-cell char)
        if (this.pendingCells.length > 1) {
            const prevKey = this.pendingCells.slice(0, -1).join("|");
            const prevMatch = modeEntries.find(e => e.dotsKey === prevKey);
            if (prevMatch) {
                const leftover = this.pendingCells[this.pendingCells.length - 1];
                this.pendingCells = [];
                return {
                    type: "matched_with_leftover",
                    entry: prevMatch,
                    leftoverCells: [leftover]
                };
            }
        }
        // No match at all — return all buffered cells for single-cell processing
        const buffered = [...this.pendingCells];
        this.pendingCells = [];
        return { type: "none", bufferedCells: buffered };
    }
    /**
     * Check if there are pending (unresolved) cells.
     */
    hasPending() {
        return this.pendingCells.length > 0;
    }
    /**
     * Flush pending cells without matching.
     */
    flushPending() {
        const cells = [...this.pendingCells];
        this.pendingCells = [];
        return cells;
    }
    /**
     * Reset the matcher state.
     */
    reset() {
        this.pendingCells = [];
    }
}
exports.MultiCellMatcher = MultiCellMatcher;
//# sourceMappingURL=multi-cell-matcher.js.map