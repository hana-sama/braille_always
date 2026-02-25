"use strict";
// ============================================================
// Indicator Matcher: Detects indicator sequences from dot input
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndicatorMatcher = void 0;
/**
 * Matches incoming dot chords against known indicator sequences.
 * Indicators can be multi-cell (e.g., kana indicator = dots 16 + dots 13).
 *
 * Uses deferred matching: when an exact match is found but a longer
 * indicator shares the same prefix, the match is deferred until the
 * next cell disambiguates.
 */
class IndicatorMatcher {
    constructor() {
        this.indicators = [];
        this.pendingCells = [];
        this.deferredMatch = null;
        this.maxCells = 1;
    }
    /**
     * Load indicator definitions.
     */
    setIndicators(indicators) {
        this.indicators = indicators;
        this.maxCells = Math.max(1, ...indicators.map(i => i.dots.length));
    }
    /**
     * Try to match a chord (as dotsKey) against indicator sequences.
     * Returns matched indicator, or null if no match (yet or at all).
     *
     * The matcher accumulates cells and checks for multi-cell indicators.
     * When an exact match exists but longer indicators share the same prefix,
     * the match is deferred until the next cell disambiguates.
     */
    tryMatch(dotsKey) {
        this.pendingCells.push(dotsKey);
        const pendingKey = this.pendingCells.join("|");
        // Check for exact match
        const exact = this.indicators.find(i => i.dotsKey === pendingKey);
        // Check for partial match (prefix of some longer indicator)
        const hasLongerPrefix = this.indicators.some(i => i.dotsKey.startsWith(pendingKey + "|"));
        if (exact && !hasLongerPrefix) {
            // Unambiguous exact match — commit immediately
            this.pendingCells = [];
            this.deferredMatch = null;
            return { type: "matched", indicator: exact };
        }
        if (exact && hasLongerPrefix) {
            // Ambiguous: exact match exists, but longer indicator also possible
            // Defer the match and wait for next cell to disambiguate
            this.deferredMatch = exact;
            return { type: "pending" };
        }
        if (!exact && hasLongerPrefix && this.pendingCells.length < this.maxCells) {
            // No exact match yet, but could become one — keep pending
            return { type: "pending" };
        }
        // No exact match and no longer prefix.
        // If we had a deferred match, the new cell didn't extend it → commit deferred
        if (this.deferredMatch) {
            const matched = this.deferredMatch;
            this.deferredMatch = null;
            // The last cell pushed is the "extra" cell that didn't match the longer form.
            // Return it as a leftover for character processing.
            const leftover = this.pendingCells[this.pendingCells.length - 1];
            this.pendingCells = [];
            return {
                type: "matched_with_leftover",
                indicator: matched,
                leftoverCells: [leftover]
            };
        }
        // No match at all — return all buffered cells for normal processing
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
        this.deferredMatch = null;
        return cells;
    }
    /**
     * Reset the matcher state.
     */
    reset() {
        this.pendingCells = [];
        this.deferredMatch = null;
    }
}
exports.IndicatorMatcher = IndicatorMatcher;
//# sourceMappingURL=indicator-matcher.js.map