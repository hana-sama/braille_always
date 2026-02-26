// ============================================================
// Unified Table: Builds merged dot→output mapping from all profiles
// ============================================================

import {
  RawBrailleProfile,
  RawBrailleEntry,
  Mode,
  UnifiedEntry,
  DotMapping,
  IndicatorDef,
  IndicatorScope,
  IndicatorType,
  ModifierKind,
  MultiCellEntry
} from "./types";

/** Subcategories that are modifiers (not mode switches) */
const MODIFIER_SUBCATEGORIES: Record<string, ModifierKind> = {
  capital: "capital",
  numeric: "numeric",
  italic: "typeform",
  bold: "typeform",
  underline: "typeform",
  script: "typeform"
};

/** Maps a system_id to one or more Modes */
function systemIdToModes(systemId: string, brailleType: string): Mode[] {
  if (systemId === "kana") {
    return ["kana"];
  }
  if (systemId === "nemeth") {
    return ["nemeth"];
  }
  // UEB: check if braille_type covers both grades
  const hasGrade1 = brailleType.includes("grade1");
  const hasGrade2 = brailleType.includes("grade2");
  if (hasGrade1 && hasGrade2) {
    return ["grade1", "grade2"];
  }
  if (hasGrade2) {
    return ["grade2"];
  }
  return ["grade1"];
}

/** Normalize dots array to a canonical key: ["1", "2"] → "12", ["14"] → "14" */
function dotsToKey(dots: string[]): string {
  if (dots.length === 1) {
    // Single cell: sort digit characters for canonical form
    return dots[0].split("").sort().join("");
  }
  // Multi-cell: join with pipe separator
  return dots.map(d => d.split("").sort().join("")).join("|");
}

export interface UnifiedData {
  /** Single-cell entries: dotsKey → UnifiedEntry */
  singleCellMap: Map<string, UnifiedEntry>;

  /** Numeric entries: dotsKey → DotMapping (for digits after numeric indicator) */
  numericMap: Map<string, DotMapping>;

  /** Indicator definitions */
  indicators: IndicatorDef[];

  /** Multi-cell entries (grouped by mode) */
  multiCellEntries: MultiCellEntry[];
}

/**
 * Build unified data structures from raw profiles.
 */
export function buildUnifiedData(
  allProfiles: Map<string, RawBrailleProfile[]>
): UnifiedData {
  const singleCellMap = new Map<string, UnifiedEntry>();
  const numericMap = new Map<string, DotMapping>();
  const indicators: IndicatorDef[] = [];
  const multiCellEntries: MultiCellEntry[] = [];

  for (const [systemId, profiles] of allProfiles) {
    for (const profile of profiles) {
      const modes = systemIdToModes(systemId, profile.braille_type);

      for (const entry of profile.entries) {
        if (entry.role === "indicator" || entry.category === "indicator") {
          // Process as indicator
          processIndicator(entry, indicators);
        } else if (entry.dots.length === 1) {
          // Single-cell entry → unified map (register under all applicable modes)
          for (const mode of modes) {
            processSingleCell(entry, mode, singleCellMap);
          }
          // Also register numbers in the numeric map
          if (entry.role === "numbers" && entry.print) {
            const key = dotsToKey(entry.dots);
            if (!numericMap.has(key)) {
              numericMap.set(key, {
                print: entry.print,
                role: entry.role,
                id: entry.id
              });
            }
          }
        } else if (entry.dots.length > 1 && entry.print) {
          // Multi-cell entry (register under all applicable modes)
          for (const mode of modes) {
            processMultiCell(entry, mode, multiCellEntries);
          }
        }
      }
    }
  }

  return { singleCellMap, numericMap, indicators, multiCellEntries };
}

function processSingleCell(
  entry: RawBrailleEntry,
  mode: Mode,
  map: Map<string, UnifiedEntry>
): void {
  if (!entry.print) {
    return;
  }
  const key = dotsToKey(entry.dots);
  const mapping: DotMapping = {
    print: entry.print,
    role: entry.role,
    id: entry.id
  };

  let unified = map.get(key);
  if (!unified) {
    unified = { dots: key, mappings: {} };
    map.set(key, unified);
  }

  const existing = unified.mappings[mode];
  if (!existing) {
    // No existing mapping for this mode → set it
    unified.mappings[mode] = mapping;
  } else {
    // Conflict: same dots key + same mode.
    // Paired punctuation (open/close roles like quotation marks)
    // should override plain single-role entries (e.g., "?" vs """).
    const newIsPaired = entry.role === "open" || entry.role === "close";
    const existingIsPaired =
      existing.role === "open" || existing.role === "close";
    if (newIsPaired && !existingIsPaired) {
      unified.mappings[mode] = mapping;
    }
  }
}

function processIndicator(
  entry: RawBrailleEntry,
  indicators: IndicatorDef[]
): void {
  const isTerminator =
    entry.tags.includes("terminator") || entry.id.includes("terminator");
  const action: "enter" | "exit" = isTerminator ? "exit" : "enter";

  // Classify indicator type: modifier vs mode_switch
  const modifierKind = MODIFIER_SUBCATEGORIES[entry.subcategory];
  const indicatorType: IndicatorType = modifierKind
    ? "modifier"
    : "mode_switch";

  // Determine target mode from tags/subcategory (only relevant for mode_switch)
  let targetMode: Mode = "grade1";
  if (entry.tags.includes("kana") || entry.subcategory === "kana") {
    targetMode = "kana";
  } else if (entry.tags.includes("grade1") || entry.subcategory === "grade1") {
    targetMode = "grade1";
  } else if (entry.subcategory === "nemeth" || entry.tags.includes("nemeth")) {
    targetMode = "nemeth";
  }

  // Determine scope from tags
  let scope: IndicatorScope = "symbol";
  if (entry.tags.includes("passage")) {
    scope = "passage";
  } else if (entry.tags.includes("word")) {
    scope = "word";
  }

  indicators.push({
    id: entry.id,
    dots: entry.dots,
    dotsKey: dotsToKey(entry.dots),
    action,
    targetMode,
    scope,
    indicatorType,
    modifier: modifierKind,
    tags: entry.tags
  });
}

function processMultiCell(
  entry: RawBrailleEntry,
  mode: Mode,
  multiCells: MultiCellEntry[]
): void {
  multiCells.push({
    id: entry.id,
    dots: entry.dots,
    dotsKey: dotsToKey(entry.dots),
    print: entry.print!,
    mode,
    role: entry.role
  });
}
