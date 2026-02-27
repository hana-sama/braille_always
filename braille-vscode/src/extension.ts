// ============================================================
// Extension Entry Point: Wires all layers together
// ============================================================

import * as vscode from "vscode";
import * as path from "path";

import { DotNumber, Mode, MultiCellEntry } from "./data/types";
import { loadAllProfiles } from "./data/profile-loader";
import { buildUnifiedData, UnifiedData } from "./data/unified-table";
import { ChordDetector } from "./input/chord-detector";
import { StateMachine } from "./engine/state-machine";
import { IndicatorMatcher } from "./engine/indicator-matcher";
import { MultiCellMatcher } from "./engine/multi-cell-matcher";
import { DotMapper } from "./engine/dot-mapper";
import { EditorOutput } from "./output/editor-output";
import { StatusBar } from "./output/status-bar";
import { BrailleTracker } from "./output/braille-tracker";
import { BrailleOverlay } from "./output/braille-overlay";

let isActive = false;
let chordDetector: ChordDetector;
let stateMachine: StateMachine;
let indicatorMatcher: IndicatorMatcher;
let multiCellMatcher: MultiCellMatcher;
let dotMapper: DotMapper;
let editorOutput: EditorOutput;
let statusBar: StatusBar;
let unifiedData: UnifiedData;
let brailleTracker: BrailleTracker;
let brailleOverlay: BrailleOverlay;
let isNumericMode = false; // Track numeric continuation
let kanaBracketOpen = true; // Toggle for kana bracket「」(dots 36)

export function activate(context: vscode.ExtensionContext) {
  console.log("[Braille] Extension activating...");

  // ---- Load data ----
  const dataDir = path.join(context.extensionPath, "data");
  const allProfiles = loadAllProfiles(dataDir);
  unifiedData = buildUnifiedData(allProfiles);

  console.log(
    `[Braille] Loaded ${unifiedData.singleCellMap.size} single-cell entries, ` +
      `${unifiedData.indicators.length} indicators, ` +
      `${unifiedData.multiCellEntries.length} multi-cell entries`
  );

  // ---- Initialize components ----
  const config = vscode.workspace.getConfiguration("braille");
  const chordTimeout = config.get<number>("chordTimeout", 50);

  stateMachine = new StateMachine("grade1");
  indicatorMatcher = new IndicatorMatcher();
  indicatorMatcher.setIndicators(unifiedData.indicators);
  multiCellMatcher = new MultiCellMatcher();
  multiCellMatcher.setEntries(unifiedData.multiCellEntries);
  dotMapper = new DotMapper();
  dotMapper.setData(unifiedData);

  // ---- Braille tracker & overlay ----
  brailleTracker = new BrailleTracker(dotMapper);
  brailleOverlay = new BrailleOverlay();

  const showOverlay = config.get<boolean>("showBrailleOverlay", true);
  brailleOverlay.setVisible(showOverlay);

  editorOutput = new EditorOutput();
  editorOutput.setTracker(brailleTracker);

  statusBar = new StatusBar();

  // ---- Chord detector: process each chord ----
  chordDetector = new ChordDetector(chordTimeout, (dots: Set<DotNumber>) => {
    handleChord(dots);
  });

  // ---- Mode change callback ----
  stateMachine.setModeChangeCallback((oldMode, newMode, indicator) => {
    console.log(`[Braille] Mode: ${oldMode} → ${newMode} (${indicator.id})`);
    statusBar.update(isActive, newMode);
    statusBar.flash(`→ ${newMode.toUpperCase()}`, 1000);
  });

  // ---- Register commands ----

  // Toggle braille input mode
  context.subscriptions.push(
    vscode.commands.registerCommand("braille.toggleMode", () => {
      isActive = !isActive;
      vscode.commands.executeCommand("setContext", "braille.active", isActive);
      statusBar.update(isActive, stateMachine.getMode());

      if (isActive) {
        vscode.window.showInformationMessage(
          `Braille Input: ON (${stateMachine.getMode().toUpperCase()})`
        );
      } else {
        // Reset state when deactivating
        chordDetector.cancel();
        indicatorMatcher.reset();
        multiCellMatcher.reset();
        stateMachine.reset();
        isNumericMode = false;
        kanaBracketOpen = true;
        brailleTracker.clear();
        updateOverlay();
        vscode.window.showInformationMessage("Braille Input: OFF");
      }
    })
  );

  // Toggle braille overlay display
  context.subscriptions.push(
    vscode.commands.registerCommand("braille.toggleOverlay", () => {
      const newVisible = !brailleOverlay.isVisible();
      brailleOverlay.setVisible(newVisible);
      updateOverlay();
      vscode.window.showInformationMessage(
        `Braille Overlay: ${newVisible ? "ON" : "OFF"}`
      );
    })
  );

  // Dot input (called by keybindings)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "braille.dotInput",
      (args: { dot: DotNumber }) => {
        if (!isActive) {
          return;
        }
        chordDetector.press(args.dot);
      }
    )
  );

  // ---- Configuration change listener ----
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("braille.chordTimeout")) {
        const newTimeout = vscode.workspace
          .getConfiguration("braille")
          .get<number>("chordTimeout", 50);
        chordDetector.setTimeout(newTimeout);
      }
      if (e.affectsConfiguration("braille.showBrailleOverlay")) {
        const show = vscode.workspace
          .getConfiguration("braille")
          .get<boolean>("showBrailleOverlay", true);
        brailleOverlay.setVisible(show);
        updateOverlay();
      }
    })
  );

  // ---- Cleanup ----
  context.subscriptions.push({
    dispose() {
      statusBar.dispose();
      brailleOverlay.dispose();
      chordDetector.cancel();
    }
  });

  console.log("[Braille] Extension activated successfully");
}

/**
 * Update the braille overlay decorations on the active editor.
 */
function updateOverlay(): void {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    brailleOverlay.update(editor, brailleTracker);
  }
}

/**
 * Process a completed chord (set of simultaneously pressed dots).
 *
 * Processing pipeline (order matters!):
 *   1. Multi-cell matcher (punctuation, symbols like quotes, slashes, brackets)
 *   2. Indicator matcher (capital, numeric, mode switches, typeforms)
 *   3. Single-cell DotMapper fallback
 *
 * Multi-cell is checked first because sequences like inner quotation
 * (6 + 236) and slash (456 + 34) start with cells that are also
 * indicator prefixes (6 = capital, 456 = underline). If indicators
 * were checked first, they'd consume the prefix cell and prevent
 * the multi-cell match.
 */
async function handleChord(dots: Set<DotNumber>): Promise<void> {
  // Handle space
  if (dots.has(0 as DotNumber)) {
    // Flush any pending multi-cell or indicator match
    await flushAllPending();
    await editorOutput.insertSpace();
    stateMachine.onSpace();
    isNumericMode = false; // Space ends numeric mode
    updateOverlay();
    return;
  }

  // Convert dots to key string
  const dotsKey = dotMapper.dotsToKey(dots);

  // ---- Step 1: Try multi-cell matching first ----
  const mode = stateMachine.getMode();
  const mcResult = multiCellMatcher.tryMatch(dotsKey, mode);

  if (mcResult.type === "matched") {
    // Multi-cell sequence matched → insert the character
    await emitMultiCellMatch(mcResult.entry);
    return;
  }

  if (mcResult.type === "matched_with_leftover") {
    await emitMultiCellMatch(mcResult.entry);
    // Process leftover cells (they might be indicators or new multi-cell starts)
    for (const cellKey of mcResult.leftoverCells) {
      await processCellFallback(cellKey);
    }
    return;
  }

  if (mcResult.type === "pending") {
    // Partial multi-cell match → wait for next chord
    return;
  }

  // mcResult.type === 'none' → multi-cell didn't match
  // Feed all buffered cells through indicator matching, then single-cell
  for (const cellKey of mcResult.bufferedCells) {
    await processCellFallback(cellKey);
  }
}

/**
 * Flush all pending state from both matchers.
 * Called on space or mode reset.
 */
async function flushAllPending(): Promise<void> {
  // Flush multi-cell pending cells
  const mcPending = multiCellMatcher.flushPending();
  for (const cellKey of mcPending) {
    await processCellFallback(cellKey);
  }
  // Flush indicator pending cells
  const indPending = indicatorMatcher.flushPending();
  for (const cellKey of indPending) {
    await processCharacter(cellKey);
  }
}

/**
 * Process a cell that didn't match as multi-cell.
 * Try indicator matching, then fall back to single-cell character output.
 */
async function processCellFallback(dotsKey: string): Promise<void> {
  // ---- Step 2: Try indicator matching ----
  const matchResult = indicatorMatcher.tryMatch(dotsKey);

  if (matchResult.type === "matched") {
    stateMachine.processIndicator(matchResult.indicator);
    if (matchResult.indicator.modifier === "numeric") {
      isNumericMode = true;
    }
    return;
  }

  if (matchResult.type === "matched_with_leftover") {
    stateMachine.processIndicator(matchResult.indicator);
    if (matchResult.indicator.modifier === "numeric") {
      isNumericMode = true;
    }
    // Process leftover cells as characters
    for (const cellKey of matchResult.leftoverCells) {
      await processCharacter(cellKey);
    }
    return;
  }

  if (matchResult.type === "pending") {
    // Partial indicator match → wait for more input
    return;
  }

  // matchResult.type === 'none' → not an indicator either
  // ---- Step 3: Single-cell character output ----
  for (const cellKey of matchResult.bufferedCells) {
    await processCharacter(cellKey);
  }
}

/**
 * Emit a matched multi-cell entry, applying any pending modifiers.
 */
async function emitMultiCellMatch(entry: MultiCellEntry): Promise<void> {
  let text = entry.print;
  const modifier = stateMachine.consumeModifier();
  if (modifier === "capital") {
    text = text.toUpperCase();
  }
  await editorOutput.insert(text, entry.dotsKey);
  stateMachine.onCharacterEmitted();
  isNumericMode = false;
  updateOverlay();
}

/**
 * Process a single cell as a character in the current mode.
 */
async function processCharacter(dotsKey: string): Promise<void> {
  const mode = stateMachine.getMode();

  // Check for numeric modifier or numeric continuation
  const modifier = stateMachine.consumeModifier();
  if (modifier === "numeric" || isNumericMode) {
    const numMapping = dotMapper.lookupNumeric(dotsKey);
    if (numMapping) {
      isNumericMode = true; // Stay in numeric mode for consecutive digits
      await editorOutput.insert(numMapping.print, dotsKey);
      stateMachine.onCharacterEmitted();
      updateOverlay();
      return;
    }
    // Not a digit — exit numeric mode and fall through to normal lookup
    isNumericMode = false;
  }

  const mapping = dotMapper.lookup(dotsKey, mode);

  if (mapping) {
    let text = mapping.print;

    // Kana bracket toggle: dots 36 alternates between「and」
    if (mode === "kana" && dotsKey === "36") {
      text = kanaBracketOpen ? "「" : "」";
      kanaBracketOpen = !kanaBracketOpen;
    }

    // Apply pending modifier (e.g., capital letter indicator)
    if (modifier === "capital") {
      text = text.toUpperCase();
    }

    await editorOutput.insert(text, dotsKey);
    stateMachine.onCharacterEmitted();
  } else {
    // No mapping found — insert Unicode braille as fallback
    const braille = dotMapper.dotsKeyToUnicodeBraille(dotsKey);
    await editorOutput.insert(braille, dotsKey);
    stateMachine.onCharacterEmitted();
  }

  updateOverlay();
}

export function deactivate() {
  console.log("[Braille] Extension deactivated");
}
