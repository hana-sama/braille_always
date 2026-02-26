import { expect } from "chai";
import {
  MultiCellMatcher,
  MultiCellMatchResult
} from "../../src/engine/multi-cell-matcher";
import { MultiCellEntry, Mode } from "../../src/data/types";

/** Helper to create a MultiCellEntry */
function makeEntry(
  id: string,
  dots: string[],
  print: string,
  mode: Mode = "grade1"
): MultiCellEntry {
  return {
    id,
    dots,
    dotsKey: dots.join("|"),
    print,
    mode,
    role: "punctuation"
  };
}

describe("MultiCellMatcher", () => {
  let matcher: MultiCellMatcher;

  beforeEach(() => {
    matcher = new MultiCellMatcher();
  });

  // ==================================================================
  // Basic matching
  // ==================================================================
  describe("basic matching", () => {
    it("should match a 2-cell sequence", () => {
      matcher.setEntries([makeEntry("left_paren", ["5", "126"], "(")]);

      const r1 = matcher.tryMatch("5", "grade1");
      expect(r1.type).to.equal("pending");

      const r2 = matcher.tryMatch("126", "grade1");
      expect(r2.type).to.equal("matched");
      if (r2.type === "matched") {
        expect(r2.entry.print).to.equal("(");
      }
    });

    it("should match a 3-cell sequence", () => {
      matcher.setEntries([makeEntry("em_dash", ["5", "6", "36"], "—")]);

      const r1 = matcher.tryMatch("5", "grade1");
      expect(r1.type).to.equal("pending");

      const r2 = matcher.tryMatch("6", "grade1");
      expect(r2.type).to.equal("pending");

      const r3 = matcher.tryMatch("36", "grade1");
      expect(r3.type).to.equal("matched");
      if (r3.type === "matched") {
        expect(r3.entry.print).to.equal("—");
      }
    });

    it("should return 'none' when no match exists", () => {
      matcher.setEntries([makeEntry("left_paren", ["5", "126"], "(")]);

      const r1 = matcher.tryMatch("999", "grade1");
      expect(r1.type).to.equal("none");
      if (r1.type === "none") {
        expect(r1.bufferedCells).to.deep.equal(["999"]);
      }
    });
  });

  // ==================================================================
  // Prefix handling & flush
  // ==================================================================
  describe("prefix handling", () => {
    it("should flush pending cells on mismatch after prefix", () => {
      matcher.setEntries([makeEntry("left_paren", ["5", "126"], "(")]);

      const r1 = matcher.tryMatch("5", "grade1");
      expect(r1.type).to.equal("pending");

      // Next cell doesn't match any continuation
      const r2 = matcher.tryMatch("999", "grade1");
      expect(r2.type).to.equal("none");
      if (r2.type === "none") {
        expect(r2.bufferedCells).to.deep.equal(["5", "999"]);
      }
    });

    it("should recover a match when the second cell starts a separate sequence", () => {
      matcher.setEntries([
        makeEntry("left_paren", ["5", "126"], "("),
        makeEntry("plus", ["5", "235"], "+")
      ]);

      const r1 = matcher.tryMatch("5", "grade1");
      expect(r1.type).to.equal("pending");

      const r2 = matcher.tryMatch("235", "grade1");
      expect(r2.type).to.equal("matched");
      if (r2.type === "matched") {
        expect(r2.entry.print).to.equal("+");
      }
    });

    it("should report pending state correctly", () => {
      matcher.setEntries([makeEntry("left_paren", ["5", "126"], "(")]);

      expect(matcher.hasPending()).to.be.false;

      matcher.tryMatch("5", "grade1");
      expect(matcher.hasPending()).to.be.true;
    });

    it("flushPending() should return and clear buffered cells", () => {
      matcher.setEntries([makeEntry("left_paren", ["5", "126"], "(")]);

      matcher.tryMatch("5", "grade1");
      const flushed = matcher.flushPending();
      expect(flushed).to.deep.equal(["5"]);
      expect(matcher.hasPending()).to.be.false;
    });
  });

  // ==================================================================
  // Mode filtering
  // ==================================================================
  describe("mode filtering", () => {
    it("should only match entries for the current mode", () => {
      matcher.setEntries([makeEntry("kana_paren", ["5", "126"], "（", "kana")]);

      // grade1 mode should not match kana entries
      const r1 = matcher.tryMatch("5", "grade1");
      // Could be pending if it tries, or none
      // Let's add a second cell to confirm
      const r2 = matcher.tryMatch("126", "grade1");
      // Should not match kana entry in grade1 mode
      expect(r2.type).to.not.equal("matched");
    });

    it("should fall back to grade1 entries", () => {
      matcher.setEntries([
        makeEntry("left_paren", ["5", "126"], "(", "grade1")
      ]);

      const r1 = matcher.tryMatch("5", "kana");
      expect(r1.type).to.equal("pending");

      const r2 = matcher.tryMatch("126", "kana");
      expect(r2.type).to.equal("matched");
      if (r2.type === "matched") {
        expect(r2.entry.print).to.equal("(");
      }
    });
  });

  // ==================================================================
  // Reset
  // ==================================================================
  describe("reset()", () => {
    it("should clear pending state", () => {
      matcher.setEntries([makeEntry("left_paren", ["5", "126"], "(")]);

      matcher.tryMatch("5", "grade1");
      expect(matcher.hasPending()).to.be.true;

      matcher.reset();
      expect(matcher.hasPending()).to.be.false;
    });
  });

  // ==================================================================
  // Multiple entries with shared prefix
  // ==================================================================
  describe("shared prefix disambiguation", () => {
    it("should handle entries with shared first cell (dots 5)", () => {
      matcher.setEntries([
        makeEntry("left_paren", ["5", "126"], "("),
        makeEntry("right_paren", ["5", "345"], ")"),
        makeEntry("plus", ["5", "235"], "+"),
        makeEntry("minus", ["5", "36"], "-")
      ]);

      // Match "("
      let r = matcher.tryMatch("5", "grade1");
      expect(r.type).to.equal("pending");
      r = matcher.tryMatch("126", "grade1");
      expect(r.type).to.equal("matched");
      if (r.type === "matched") {
        expect(r.entry.print).to.equal("(");
      }

      // Match ")"
      r = matcher.tryMatch("5", "grade1");
      expect(r.type).to.equal("pending");
      r = matcher.tryMatch("345", "grade1");
      expect(r.type).to.equal("matched");
      if (r.type === "matched") {
        expect(r.entry.print).to.equal(")");
      }

      // Match "-"
      r = matcher.tryMatch("5", "grade1");
      expect(r.type).to.equal("pending");
      r = matcher.tryMatch("36", "grade1");
      expect(r.type).to.equal("matched");
      if (r.type === "matched") {
        expect(r.entry.print).to.equal("-");
      }
    });
  });
});
