import { expect } from "chai";
import { DotMapper } from "../../src/engine/dot-mapper";
import {
  DotNumber,
  UnifiedEntry,
  DotMapping,
  Mode
} from "../../src/data/types";
import { UnifiedData } from "../../src/data/unified-table";

describe("DotMapper", () => {
  let mapper: DotMapper;

  beforeEach(() => {
    mapper = new DotMapper();
  });

  // ==================================================================
  // dotsToKey()
  // ==================================================================
  describe("dotsToKey()", () => {
    it("should convert a single dot to its string", () => {
      const dots = new Set<DotNumber>([1]);
      expect(mapper.dotsToKey(dots)).to.equal("1");
    });

    it("should sort multiple dots numerically", () => {
      const dots = new Set<DotNumber>([4, 1, 2]);
      expect(mapper.dotsToKey(dots)).to.equal("124");
    });

    it("should filter out dot 0 (space)", () => {
      const dots = new Set<DotNumber>([0, 1, 3]);
      expect(mapper.dotsToKey(dots)).to.equal("13");
    });

    it("should return empty string for space-only input", () => {
      const dots = new Set<DotNumber>([0]);
      expect(mapper.dotsToKey(dots)).to.equal("");
    });

    it("should handle all six dots", () => {
      const dots = new Set<DotNumber>([1, 2, 3, 4, 5, 6]);
      expect(mapper.dotsToKey(dots)).to.equal("123456");
    });
  });

  // ==================================================================
  // lookup()
  // ==================================================================
  describe("lookup()", () => {
    function makeData(
      entries: [string, Partial<Record<Mode, DotMapping>>][]
    ): UnifiedData {
      const singleCellMap = new Map<string, UnifiedEntry>();
      for (const [dots, mappings] of entries) {
        singleCellMap.set(dots, { dots, mappings });
      }
      return { singleCellMap, indicators: [], multiCellEntries: [] };
    }

    it("should return null when no data is set", () => {
      expect(mapper.lookup("1", "grade1")).to.be.null;
    });

    it("should return the mapping for the exact mode", () => {
      const data = makeData([
        [
          "1",
          {
            grade1: { print: "a", role: "letter", id: "ueb_a" },
            kana: { print: "あ", role: "letter", id: "kana_a" }
          }
        ]
      ]);
      mapper.setData(data);

      const result = mapper.lookup("1", "kana");
      expect(result).to.not.be.null;
      expect(result!.print).to.equal("あ");
      expect(result!.id).to.equal("kana_a");
    });

    it("should fall back to grade1 when the requested mode has no mapping", () => {
      const data = makeData([
        [
          "1",
          {
            grade1: { print: "a", role: "letter", id: "ueb_a" }
          }
        ]
      ]);
      mapper.setData(data);

      const result = mapper.lookup("1", "nemeth");
      expect(result).to.not.be.null;
      expect(result!.print).to.equal("a");
    });

    it("should return null when no mapping exists for any mode", () => {
      const data = makeData([
        [
          "1",
          {
            kana: { print: "あ", role: "letter", id: "kana_a" }
          }
        ]
      ]);
      mapper.setData(data);

      // Requesting grade2, no grade2 entry, and no grade1 fallback either
      const result = mapper.lookup("1", "grade2");
      expect(result).to.be.null;
    });

    it("should return null for an unknown dots key", () => {
      const data = makeData([
        ["1", { grade1: { print: "a", role: "letter", id: "ueb_a" } }]
      ]);
      mapper.setData(data);

      expect(mapper.lookup("999", "grade1")).to.be.null;
    });
  });

  // ==================================================================
  // dotsToUnicodeBraille()
  // ==================================================================
  describe("dotsToUnicodeBraille()", () => {
    it("should return U+2800 (blank braille) for empty/space", () => {
      const dots = new Set<DotNumber>([0]);
      expect(mapper.dotsToUnicodeBraille(dots)).to.equal("\u2800");
    });

    it("should encode dot 1 as U+2801", () => {
      const dots = new Set<DotNumber>([1]);
      expect(mapper.dotsToUnicodeBraille(dots)).to.equal("\u2801");
    });

    it("should encode dots 1,2 as U+2803", () => {
      const dots = new Set<DotNumber>([1, 2]);
      // dot1=0x01, dot2=0x02 → 0x03
      expect(mapper.dotsToUnicodeBraille(dots)).to.equal("\u2803");
    });

    it("should encode all six dots as U+283F", () => {
      const dots = new Set<DotNumber>([1, 2, 3, 4, 5, 6]);
      // 0x01+0x02+0x04+0x08+0x10+0x20 = 0x3F
      expect(mapper.dotsToUnicodeBraille(dots)).to.equal("\u283F");
    });

    it("should encode dots 3,4,5 correctly", () => {
      const dots = new Set<DotNumber>([3, 4, 5]);
      // dot3=0x04, dot4=0x08, dot5=0x10 → 0x1C
      expect(mapper.dotsToUnicodeBraille(dots)).to.equal("\u281C");
    });
  });

  // ==================================================================
  // dotsKeyToUnicodeBraille()
  // ==================================================================
  describe("dotsKeyToUnicodeBraille()", () => {
    it("should encode '1' as U+2801", () => {
      expect(mapper.dotsKeyToUnicodeBraille("1")).to.equal("\u2801");
    });

    it("should encode '123456' as U+283F", () => {
      expect(mapper.dotsKeyToUnicodeBraille("123456")).to.equal("\u283F");
    });

    it("should encode '14' (dots 1,4) correctly", () => {
      // dot1=0x01, dot4=0x08 → 0x09
      expect(mapper.dotsKeyToUnicodeBraille("14")).to.equal("\u2809");
    });

    it("should return U+2800 for empty string", () => {
      expect(mapper.dotsKeyToUnicodeBraille("")).to.equal("\u2800");
    });
  });
});
