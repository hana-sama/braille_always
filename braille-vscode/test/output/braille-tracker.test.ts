// ============================================================
// Unit Tests: BrailleTracker
// ============================================================

import { expect } from "chai";
import { BrailleTracker } from "../../src/output/braille-tracker";
import { DotMapper } from "../../src/engine/dot-mapper";
import { UnifiedData } from "../../src/data/unified-table";
import {
  UnifiedEntry,
  IndicatorDef,
  MultiCellEntry
} from "../../src/data/types";

/**
 * Create a minimal DotMapper with a few test mappings.
 */
function createTestDotMapper(): DotMapper {
  const mapper = new DotMapper();

  // Build a minimal UnifiedData with entries for dots 1 (a), 12 (b), 14 (c)
  const singleCellMap = new Map<string, UnifiedEntry>();
  singleCellMap.set("1", {
    dots: "1",
    mappings: { grade1: { print: "a", role: "letter", id: "letter-a" } }
  });
  singleCellMap.set("12", {
    dots: "12",
    mappings: { grade1: { print: "b", role: "letter", id: "letter-b" } }
  });
  singleCellMap.set("14", {
    dots: "14",
    mappings: { grade1: { print: "c", role: "letter", id: "letter-c" } }
  });

  const unifiedData: UnifiedData = {
    singleCellMap,
    numericMap: new Map(),
    indicators: [] as IndicatorDef[],
    multiCellEntries: [] as MultiCellEntry[]
  };

  mapper.setData(unifiedData);
  return mapper;
}

describe("BrailleTracker", () => {
  let tracker: BrailleTracker;
  let dotMapper: DotMapper;

  beforeEach(() => {
    dotMapper = createTestDotMapper();
    tracker = new BrailleTracker(dotMapper);
  });

  describe("record()", () => {
    it("should store a dotsKey at the given position", () => {
      tracker.record(0, 0, "1");
      expect(tracker.hasLine(0)).to.be.true;
    });

    it("should fill gaps with empty strings when recording at non-zero column", () => {
      tracker.record(0, 3, "1");
      // Line should have 4 entries: ["", "", "", "1"]
      const braille = tracker.getLine(0);
      // First 3 are braille space (U+2800), last is dots-1 (⠁)
      expect(braille).to.equal("\u2800\u2800\u2800\u2801");
    });
  });

  describe("recordSpace()", () => {
    it("should record an empty string (braille space) at the position", () => {
      tracker.record(0, 0, "1"); // 'a' at col 0
      tracker.recordSpace(0, 1); // space at col 1
      tracker.record(0, 2, "12"); // 'b' at col 2

      const braille = tracker.getLine(0);
      // ⠁ (dots-1) + ⠀ (space) + ⠃ (dots-12)
      expect(braille).to.equal("\u2801\u2800\u2803");
    });
  });

  describe("getLine()", () => {
    it("should return empty string for untracked lines", () => {
      expect(tracker.getLine(99)).to.equal("");
    });

    it("should return correct Unicode braille for recorded dots", () => {
      tracker.record(0, 0, "1"); // a → ⠁
      tracker.record(0, 1, "12"); // b → ⠃
      tracker.record(0, 2, "14"); // c → ⠉

      const braille = tracker.getLine(0);
      expect(braille).to.equal("\u2801\u2803\u2809");
    });

    it("should handle multiple lines independently", () => {
      tracker.record(0, 0, "1");
      tracker.record(1, 0, "12");

      expect(tracker.getLine(0)).to.equal("\u2801");
      expect(tracker.getLine(1)).to.equal("\u2803");
    });
  });

  describe("hasLine()", () => {
    it("should return false for untracked lines", () => {
      expect(tracker.hasLine(0)).to.be.false;
    });

    it("should return true for lines with recorded data", () => {
      tracker.record(5, 0, "1");
      expect(tracker.hasLine(5)).to.be.true;
    });
  });

  describe("getTrackedLines()", () => {
    it("should return sorted list of tracked line numbers", () => {
      tracker.record(3, 0, "1");
      tracker.record(1, 0, "12");
      tracker.record(5, 0, "14");

      expect(tracker.getTrackedLines()).to.deep.equal([1, 3, 5]);
    });

    it("should return empty array when no lines tracked", () => {
      expect(tracker.getTrackedLines()).to.deep.equal([]);
    });
  });

  describe("clear()", () => {
    it("should remove all tracked data", () => {
      tracker.record(0, 0, "1");
      tracker.record(1, 0, "12");

      tracker.clear();

      expect(tracker.hasLine(0)).to.be.false;
      expect(tracker.hasLine(1)).to.be.false;
      expect(tracker.getTrackedLines()).to.deep.equal([]);
    });
  });
});
