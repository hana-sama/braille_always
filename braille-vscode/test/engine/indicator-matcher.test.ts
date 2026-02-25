import { expect } from "chai";
import {
  IndicatorMatcher,
  IndicatorMatchResult
} from "../../src/engine/indicator-matcher";
import { IndicatorDef } from "../../src/data/types";

/** Helper to create an IndicatorDef with defaults */
function makeIndicator(
  overrides: Partial<IndicatorDef> & { id: string; dots: string[] }
): IndicatorDef {
  return {
    dotsKey: overrides.dots.map(d => d.split("").sort().join("")).join("|"),
    action: "enter",
    targetMode: "kana",
    scope: "symbol",
    indicatorType: "mode_switch",
    tags: [],
    ...overrides
  };
}

describe("IndicatorMatcher", () => {
  let matcher: IndicatorMatcher;

  beforeEach(() => {
    matcher = new IndicatorMatcher();
  });

  // ==================================================================
  // Single-cell indicators
  // ==================================================================
  describe("single-cell indicators", () => {
    it("should match a single-cell indicator", () => {
      const indicator = makeIndicator({
        id: "grade1_symbol",
        dots: ["56"],
        targetMode: "grade1",
        scope: "symbol"
      });
      matcher.setIndicators([indicator]);

      const result = matcher.tryMatch("56");
      expect(result.type).to.equal("matched");
      if (result.type === "matched") {
        expect(result.indicator.id).to.equal("grade1_symbol");
      }
    });

    it("should return 'none' with buffered cells for non-indicator input", () => {
      const indicator = makeIndicator({
        id: "grade1_symbol",
        dots: ["56"],
        targetMode: "grade1"
      });
      matcher.setIndicators([indicator]);

      const result = matcher.tryMatch("1");
      expect(result.type).to.equal("none");
      if (result.type === "none") {
        expect(result.bufferedCells).to.deep.equal(["1"]);
      }
    });
  });

  // ==================================================================
  // Multi-cell indicators
  // ==================================================================
  describe("multi-cell indicators", () => {
    it("should return 'pending' for partial match of multi-cell indicator", () => {
      const indicator = makeIndicator({
        id: "kana_indicator",
        dots: ["16", "13"],
        targetMode: "kana",
        scope: "passage"
      });
      matcher.setIndicators([indicator]);

      // First cell matches the first part of "16|13"
      const result1 = matcher.tryMatch("16");
      expect(result1.type).to.equal("pending");
    });

    it("should match after receiving all cells of a multi-cell indicator", () => {
      const indicator = makeIndicator({
        id: "kana_indicator",
        dots: ["16", "13"],
        targetMode: "kana",
        scope: "passage"
      });
      matcher.setIndicators([indicator]);

      matcher.tryMatch("16"); // pending
      const result2 = matcher.tryMatch("13");
      expect(result2.type).to.equal("matched");
      if (result2.type === "matched") {
        expect(result2.indicator.id).to.equal("kana_indicator");
      }
    });

    it("should return 'none' with all buffered cells when second cell doesn't match", () => {
      const indicator = makeIndicator({
        id: "kana_indicator",
        dots: ["16", "13"],
        targetMode: "kana",
        scope: "passage"
      });
      matcher.setIndicators([indicator]);

      matcher.tryMatch("16"); // pending
      const result2 = matcher.tryMatch("1"); // not "13"
      expect(result2.type).to.equal("none");
      if (result2.type === "none") {
        expect(result2.bufferedCells).to.deep.equal(["16", "1"]);
      }
    });
  });

  // ==================================================================
  // hasPending() / flushPending() / reset()
  // ==================================================================
  describe("state management", () => {
    it("hasPending() should be false initially", () => {
      expect(matcher.hasPending()).to.be.false;
    });

    it("hasPending() should be true after a partial match", () => {
      const indicator = makeIndicator({
        id: "kana_indicator",
        dots: ["16", "13"],
        targetMode: "kana"
      });
      matcher.setIndicators([indicator]);

      matcher.tryMatch("16"); // pending
      expect(matcher.hasPending()).to.be.true;
    });

    it("flushPending() should return and clear buffered cells", () => {
      const indicator = makeIndicator({
        id: "kana_indicator",
        dots: ["16", "13"],
        targetMode: "kana"
      });
      matcher.setIndicators([indicator]);

      matcher.tryMatch("16"); // pending
      const flushed = matcher.flushPending();
      expect(flushed).to.deep.equal(["16"]);
      expect(matcher.hasPending()).to.be.false;
    });

    it("reset() should clear all pending state", () => {
      const indicator = makeIndicator({
        id: "kana_indicator",
        dots: ["16", "13"],
        targetMode: "kana"
      });
      matcher.setIndicators([indicator]);

      matcher.tryMatch("16");
      matcher.reset();
      expect(matcher.hasPending()).to.be.false;
    });
  });

  // ==================================================================
  // Deferred matching (overlapping indicators)
  // ==================================================================
  describe("deferred matching (overlapping indicators)", () => {
    const kanaEnter = makeIndicator({
      id: "kana_enter",
      dots: ["16", "13"],
      targetMode: "kana",
      action: "enter",
      scope: "passage"
    });
    const kanaTerminator = makeIndicator({
      id: "kana_terminator",
      dots: ["16", "13", "3"],
      targetMode: "kana",
      action: "exit",
      tags: ["kana", "terminator"]
    });

    it("should defer matching kana enter when terminator shares the same prefix", () => {
      matcher.setIndicators([kanaEnter, kanaTerminator]);

      const r1 = matcher.tryMatch("16");
      expect(r1.type).to.equal("pending");

      // "16|13" matches kana_enter exactly, but "16|13|3" (terminator) starts with "16|13|"
      // So it should defer, not match immediately
      const r2 = matcher.tryMatch("13");
      expect(r2.type).to.equal("pending");
    });

    it("should match terminator when third cell completes it", () => {
      matcher.setIndicators([kanaEnter, kanaTerminator]);

      matcher.tryMatch("16"); // pending
      matcher.tryMatch("13"); // pending (deferred kana_enter)
      const r3 = matcher.tryMatch("3"); // completes terminator
      expect(r3.type).to.equal("matched");
      if (r3.type === "matched") {
        expect(r3.indicator.id).to.equal("kana_terminator");
      }
    });

    it("should return deferred match with leftover when third cell doesn't extend", () => {
      matcher.setIndicators([kanaEnter, kanaTerminator]);

      matcher.tryMatch("16"); // pending
      matcher.tryMatch("13"); // pending (deferred kana_enter)
      const r3 = matcher.tryMatch("1"); // "1" doesn't extend to terminator
      expect(r3.type).to.equal("matched_with_leftover");
      if (r3.type === "matched_with_leftover") {
        expect(r3.indicator.id).to.equal("kana_enter");
        expect(r3.leftoverCells).to.deep.equal(["1"]);
      }
    });
  });
});
