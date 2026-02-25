// ============================================================
// Extension Entry Point: Wires all layers together
// ============================================================

import * as vscode from "vscode";
import * as path from "path";

import { DotNumber, Mode } from "./data/types";
import { loadAllProfiles } from "./data/profile-loader";
import { buildUnifiedData, UnifiedData } from "./data/unified-table";
import { ChordDetector } from "./input/chord-detector";
import { StateMachine } from "./engine/state-machine";
import { IndicatorMatcher } from "./engine/indicator-matcher";
import { DotMapper } from "./engine/dot-mapper";
import { EditorOutput } from "./output/editor-output";
import { StatusBar } from "./output/status-bar";

let isActive = false;
let chordDetector: ChordDetector;
let stateMachine: StateMachine;
let indicatorMatcher: IndicatorMatcher;
let dotMapper: DotMapper;
let editorOutput: EditorOutput;
let statusBar: StatusBar;
let unifiedData: UnifiedData;

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
  dotMapper = new DotMapper();
  dotMapper.setData(unifiedData);
  editorOutput = new EditorOutput();
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
        stateMachine.reset();
        vscode.window.showInformationMessage("Braille Input: OFF");
      }
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
    })
  );

  // ---- Cleanup ----
  context.subscriptions.push({
    dispose() {
      statusBar.dispose();
      chordDetector.cancel();
    }
  });

  console.log("[Braille] Extension activated successfully");
}

/**
 * Process a completed chord (set of simultaneously pressed dots).
 */
async function handleChord(dots: Set<DotNumber>): Promise<void> {
  // Handle space
  if (dots.has(0 as DotNumber)) {
    await editorOutput.insertSpace();
    stateMachine.onSpace();
    return;
  }

  // Convert dots to key string
  const dotsKey = dotMapper.dotsToKey(dots);

  // ---- Step 1: Try indicator matching ----
  const matchResult = indicatorMatcher.tryMatch(dotsKey);

  if (matchResult.type === "matched") {
    // Indicator detected → trigger mode transition
    stateMachine.processIndicator(matchResult.indicator);
    return;
  }

  if (matchResult.type === "matched_with_leftover") {
    // Indicator matched after deferred disambiguation, with leftover cells
    stateMachine.processIndicator(matchResult.indicator);
    // Process leftover cells as characters
    for (const cellKey of matchResult.leftoverCells) {
      await processCharacter(cellKey);
    }
    return;
  }

  if (matchResult.type === "pending") {
    // Partial indicator match → wait for next chord
    return;
  }

  // matchResult.type === 'none' → process buffered cells as characters
  for (const cellKey of matchResult.bufferedCells) {
    await processCharacter(cellKey);
  }
}

/**
 * Process a single cell as a character in the current mode.
 */
async function processCharacter(dotsKey: string): Promise<void> {
  const mode = stateMachine.getMode();
  const mapping = dotMapper.lookup(dotsKey, mode);

  if (mapping) {
    let text = mapping.print;

    // Apply pending modifier (e.g., capital letter indicator)
    const modifier = stateMachine.consumeModifier();
    if (modifier === "capital") {
      text = text.toUpperCase();
    }

    await editorOutput.insert(text);
    stateMachine.onCharacterEmitted();
  } else {
    // No mapping found — insert Unicode braille as fallback
    // Clear any pending modifier since we can't apply it
    stateMachine.consumeModifier();
    const braille = dotMapper.dotsKeyToUnicodeBraille(dotsKey);
    await editorOutput.insert(braille);
    stateMachine.onCharacterEmitted();
  }
}

export function deactivate() {
  console.log("[Braille] Extension deactivated");
}
