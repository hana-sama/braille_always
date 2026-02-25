// ============================================================
// Type definitions for the Unified Indicator-Based Braille Input
// ============================================================

/** Braille input modes */
export type Mode = "grade1" | "kana" | "grade2" | "nemeth";

/** Scope of an indicator (how much text it affects) */
export type IndicatorScope = "symbol" | "word" | "passage";

/** Whether the indicator switches mode or modifies the next character(s) */
export type IndicatorType = "mode_switch" | "modifier";

/** Kind of modifier (for modifier-type indicators) */
export type ModifierKind = "capital" | "numeric" | "typeform";

/** Dot input: 0=space, 1-6=dots */
export type DotNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ---- Raw JSON data types (matching braille-lib output) ----

export interface RawBrailleEntry {
  id: string;
  category: string;
  subcategory: string;
  print: string | null;
  braille?: string;
  dots: string[];
  unicode?: string;
  context: {
    position: string;
    requires_indicator: boolean;
    priority: number;
  };
  role: string;
  tags: string[];
  note: string;
}

export interface RawBrailleProfile {
  schema_version: string;
  system_id: string;
  system_name: string;
  locale: string;
  braille_type: string;
  cell_size: number;
  entries: RawBrailleEntry[];
  settings?: Record<string, unknown>;
}

// ---- Unified runtime types ----

/** A single mapping from dots to a printable character in a specific mode */
export interface DotMapping {
  print: string;
  role: string;
  id: string;
}

/** Unified entry: same dots → different output per mode */
export interface UnifiedEntry {
  dots: string;
  mappings: Partial<Record<Mode, DotMapping>>;
}

/** Indicator definition for mode transitions */
export interface IndicatorDef {
  id: string;
  dots: string[]; // Multi-cell: ["16", "13"]
  dotsKey: string; // Joined key: "16|13"
  action: "enter" | "exit";
  targetMode: Mode;
  scope: IndicatorScope;
  indicatorType: IndicatorType;
  modifier?: ModifierKind;
  tags: string[];
}

/** Multi-cell entry (special chars, contractions) that require indicator prefix */
export interface MultiCellEntry {
  id: string;
  dots: string[]; // e.g. ["4", "124"]
  dotsKey: string;
  print: string;
  mode: Mode;
  role: string;
}

/** Key layout mapping */
export interface KeyLayout {
  [key: string]: DotNumber;
}

/** State machine transition rule */
export interface TransitionRule {
  from: Mode;
  indicatorId: string;
  to: Mode;
}
