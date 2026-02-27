import { expect } from "chai";
import { buildUnifiedData, UnifiedData } from "../../src/data/unified-table";
import { RawBrailleProfile, RawBrailleEntry } from "../../src/data/types";

/** Helper to create a minimal RawBrailleEntry */
function makeEntry(
  overrides: Partial<RawBrailleEntry> & { id: string; dots: string[] }
): RawBrailleEntry {
  return {
    category: "letter",
    subcategory: "lowercase",
    print: null,
    braille: undefined,
    unicode: undefined,
    context: { position: "any", requires_indicator: false, priority: 0 },
    role: "letter",
    tags: [],
    note: "",
    ...overrides
  };
}

/** Helper to create a minimal RawBrailleProfile */
function makeProfile(
  systemId: string,
  brailleType: string,
  entries: RawBrailleEntry[]
): RawBrailleProfile {
  return {
    schema_version: "1.0",
    system_id: systemId,
    system_name: systemId,
    locale: "en",
    braille_type: brailleType,
    cell_size: 6,
    entries
  };
}

describe("buildUnifiedData()", () => {
  // ==================================================================
  // Single-cell merging
  // ==================================================================
  describe("single-cell entries", () => {
    it("should create a unified entry from a single profile", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({ id: "ueb_a", dots: ["1"], print: "a" }),
        makeEntry({ id: "ueb_b", dots: ["12"], print: "b" })
      ]);

      const allProfiles = new Map([["ueb", [profile]]]);
      const data = buildUnifiedData(allProfiles);

      expect(data.singleCellMap.size).to.equal(2);

      const entryA = data.singleCellMap.get("1");
      expect(entryA).to.not.be.undefined;
      expect(entryA!.mappings.grade1?.print).to.equal("a");

      const entryB = data.singleCellMap.get("12");
      expect(entryB).to.not.be.undefined;
      expect(entryB!.mappings.grade1?.print).to.equal("b");
    });

    it("should merge the same dots key across different modes", () => {
      const uebProfile = makeProfile("ueb", "grade1", [
        makeEntry({ id: "ueb_a", dots: ["1"], print: "a" })
      ]);
      const kanaProfile = makeProfile("kana", "grade1", [
        makeEntry({ id: "kana_a", dots: ["1"], print: "あ" })
      ]);

      const allProfiles = new Map([
        ["ueb", [uebProfile]],
        ["kana", [kanaProfile]]
      ]);
      const data = buildUnifiedData(allProfiles);

      const entry = data.singleCellMap.get("1");
      expect(entry).to.not.be.undefined;
      expect(entry!.mappings.grade1?.print).to.equal("a");
      expect(entry!.mappings.kana?.print).to.equal("あ");
    });

    it("should skip entries without a print value", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({ id: "ueb_no_print", dots: ["1"], print: null })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.singleCellMap.size).to.equal(0);
    });

    it("should use first-definition-wins for same mode/dots", () => {
      const profile1 = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "ueb_a_first",
          dots: ["1"],
          print: "a",
          context: { position: "any", requires_indicator: false, priority: 10 }
        })
      ]);
      const profile2 = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "ueb_a_second",
          dots: ["1"],
          print: "A",
          context: { position: "any", requires_indicator: false, priority: 5 }
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile1, profile2]]]));
      const entry = data.singleCellMap.get("1");
      expect(entry!.mappings.grade1?.print).to.equal("a"); // first wins
    });

    it("should override with open/close role when dots key conflicts", () => {
      // Simulates the dots 236 conflict: "?" (punctuation) vs """ (open)
      const profile = makeProfile("ueb", "grade1 and grade2", [
        makeEntry({
          id: "question",
          dots: ["236"],
          print: "?",
          role: "punctuation"
        }),
        makeEntry({
          id: "left_quote",
          dots: ["236"],
          print: "\u201c",
          role: "open"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      const entry = data.singleCellMap.get("236");
      expect(entry).to.not.be.undefined;
      // Open role should win over punctuation
      expect(entry!.mappings.grade1?.print).to.equal("\u201c");
      expect(entry!.mappings.grade1?.role).to.equal("open");
    });

    it("should normalize dots key order (sort digits)", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({ id: "ueb_test", dots: ["42"], print: "x" }) // "42" → "24"
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.singleCellMap.has("24")).to.be.true;
      expect(data.singleCellMap.has("42")).to.be.false;
    });

    it("should override contraction with punctuation role when dots key conflicts", () => {
      // Simulates dots 256 conflict: "dis" (groupsigns) vs "." (punctuation)
      const profile = makeProfile("ueb", "grade1 and grade2", [
        makeEntry({
          id: "contraction_dis",
          dots: ["256"],
          print: "dis",
          role: "groupsigns"
        }),
        makeEntry({
          id: "period",
          dots: ["256"],
          print: ".",
          role: "punctuation"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      const entry = data.singleCellMap.get("256");
      expect(entry).to.not.be.undefined;
      // Punctuation should win over contraction/groupsigns
      expect(entry!.mappings.grade1?.print).to.equal(".");
      expect(entry!.mappings.grade1?.role).to.equal("punctuation");
    });

    it("should let open/close override punctuation (highest priority)", () => {
      // Simulates dots 236: contraction → punctuation → open (quotation)
      const profile = makeProfile("ueb", "grade1 and grade2", [
        makeEntry({
          id: "contraction_his",
          dots: ["236"],
          print: "his",
          role: "wordsigns"
        }),
        makeEntry({
          id: "question",
          dots: ["236"],
          print: "?",
          role: "punctuation"
        }),
        makeEntry({
          id: "left_quote",
          dots: ["236"],
          print: "\u201c",
          role: "open"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      const entry = data.singleCellMap.get("236");
      expect(entry).to.not.be.undefined;
      // Open role should win over both punctuation and contraction
      expect(entry!.mappings.grade1?.print).to.equal("\u201c");
      expect(entry!.mappings.grade1?.role).to.equal("open");
    });
  });

  // ==================================================================
  // Indicators
  // ==================================================================
  describe("indicators", () => {
    it("should extract indicator entries", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "kana_indicator",
          dots: ["16", "13"],
          role: "indicator",
          tags: ["kana", "passage"],
          subcategory: "kana"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.indicators).to.have.length(1);
      expect(data.indicators[0].id).to.equal("kana_indicator");
      expect(data.indicators[0].targetMode).to.equal("kana");
      expect(data.indicators[0].scope).to.equal("passage");
      expect(data.indicators[0].action).to.equal("enter");
    });

    it("should recognize terminator indicators as 'exit' action", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "kana_terminator",
          dots: ["16", "13"],
          role: "indicator",
          tags: ["kana", "terminator"],
          subcategory: "kana"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.indicators[0].action).to.equal("exit");
    });

    it("should default indicator scope to 'symbol'", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "grade1_symbol",
          dots: ["56"],
          role: "indicator",
          tags: ["grade1"],
          subcategory: "grade1"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.indicators[0].scope).to.equal("symbol");
    });

    it("should detect word scope from tags", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "grade1_word",
          dots: ["56"],
          role: "indicator",
          tags: ["grade1", "word"],
          subcategory: "grade1"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.indicators[0].scope).to.equal("word");
    });

    it("should also detect indicators by category field", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "special_indicator",
          dots: ["456"],
          category: "indicator",
          role: "special",
          tags: ["nemeth"],
          subcategory: "nemeth"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.indicators).to.have.length(1);
      expect(data.indicators[0].targetMode).to.equal("nemeth");
    });
  });

  // ==================================================================
  // Multi-cell entries
  // ==================================================================
  describe("multi-cell entries", () => {
    it("should extract multi-cell entries with print values", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "ueb_ch",
          dots: ["16", "125"],
          print: "ch",
          role: "contraction"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.multiCellEntries).to.have.length(1);
      expect(data.multiCellEntries[0].print).to.equal("ch");
      expect(data.multiCellEntries[0].dotsKey).to.equal("16|125");
    });

    it("should not create multi-cell entries without a print value", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "ueb_no_print",
          dots: ["16", "125"],
          print: null,
          role: "contraction"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.multiCellEntries).to.have.length(0);
    });
  });

  // ==================================================================
  // Mode detection from system_id and braille_type
  // ==================================================================
  describe("mode detection", () => {
    it("should map system_id 'kana' to kana mode", () => {
      const profile = makeProfile("kana", "grade1", [
        makeEntry({ id: "k_a", dots: ["1"], print: "あ" })
      ]);

      const data = buildUnifiedData(new Map([["kana", [profile]]]));
      const entry = data.singleCellMap.get("1");
      expect(entry!.mappings.kana?.print).to.equal("あ");
    });

    it("should map braille_type containing 'grade2' to grade2 mode", () => {
      const profile = makeProfile("ueb", "grade2_contracted", [
        makeEntry({ id: "g2_and", dots: ["12346"], print: "and" })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      const entry = data.singleCellMap.get("12346");
      expect(entry!.mappings.grade2?.print).to.equal("and");
    });
  });

  // ==================================================================
  // Edge cases
  // ==================================================================
  describe("edge cases", () => {
    it("should handle empty profiles gracefully", () => {
      const data = buildUnifiedData(new Map());
      expect(data.singleCellMap.size).to.equal(0);
      expect(data.numericMap.size).to.equal(0);
      expect(data.indicators).to.have.length(0);
      expect(data.multiCellEntries).to.have.length(0);
    });

    it("should handle a profile with no entries", () => {
      const profile = makeProfile("ueb", "grade1", []);
      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.singleCellMap.size).to.equal(0);
    });
  });

  // ==================================================================
  // Numeric map
  // ==================================================================
  describe("numeric map", () => {
    it("should store entries with role 'numbers' in numericMap", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "number_1",
          dots: ["1"],
          print: "1",
          role: "numbers",
          tags: ["numbers"]
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.numericMap.size).to.equal(1);
      expect(data.numericMap.get("1")?.print).to.equal("1");
      expect(data.numericMap.get("1")?.role).to.equal("numbers");
    });

    it("should not store non-number entries in numericMap", () => {
      const profile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "letter_a",
          dots: ["1"],
          print: "a",
          role: "letter"
        })
      ]);

      const data = buildUnifiedData(new Map([["ueb", [profile]]]));
      expect(data.numericMap.size).to.equal(0);
    });

    it("should allow same dots key in both singleCellMap and numericMap", () => {
      const letterProfile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "letter_a",
          dots: ["1"],
          print: "a",
          role: "letter"
        })
      ]);
      const numberProfile = makeProfile("ueb", "grade1", [
        makeEntry({
          id: "number_1",
          dots: ["1"],
          print: "1",
          role: "numbers",
          tags: ["numbers"]
        })
      ]);

      const data = buildUnifiedData(
        new Map([["ueb", [letterProfile, numberProfile]]])
      );
      // Letter in singleCellMap
      expect(data.singleCellMap.get("1")?.mappings.grade1?.print).to.equal("a");
      // Number in numericMap
      expect(data.numericMap.get("1")?.print).to.equal("1");
    });
  });
});
