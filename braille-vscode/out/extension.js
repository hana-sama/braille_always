"use strict";
// ============================================================
// Extension Entry Point: Wires all layers together
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const profile_loader_1 = require("./data/profile-loader");
const unified_table_1 = require("./data/unified-table");
const chord_detector_1 = require("./input/chord-detector");
const state_machine_1 = require("./engine/state-machine");
const indicator_matcher_1 = require("./engine/indicator-matcher");
const multi_cell_matcher_1 = require("./engine/multi-cell-matcher");
const dot_mapper_1 = require("./engine/dot-mapper");
const editor_output_1 = require("./output/editor-output");
const status_bar_1 = require("./output/status-bar");
const braille_tracker_1 = require("./output/braille-tracker");
const braille_overlay_1 = require("./output/braille-overlay");
let isActive = false;
let chordDetector;
let stateMachine;
let indicatorMatcher;
let multiCellMatcher;
let dotMapper;
let editorOutput;
let statusBar;
let unifiedData;
let brailleTracker;
let brailleOverlay;
let isNumericMode = false; // Track numeric continuation
let kanaBracketOpen = true; // Toggle for kana bracket「」(dots 36)
function activate(context) {
    console.log("[Braille] Extension activating...");
    // ---- Load data ----
    const dataDir = path.join(context.extensionPath, "data");
    const allProfiles = (0, profile_loader_1.loadAllProfiles)(dataDir);
    unifiedData = (0, unified_table_1.buildUnifiedData)(allProfiles);
    console.log(`[Braille] Loaded ${unifiedData.singleCellMap.size} single-cell entries, ` +
        `${unifiedData.indicators.length} indicators, ` +
        `${unifiedData.multiCellEntries.length} multi-cell entries`);
    // ---- Initialize components ----
    const config = vscode.workspace.getConfiguration("braille");
    const chordTimeout = config.get("chordTimeout", 50);
    stateMachine = new state_machine_1.StateMachine("grade1");
    indicatorMatcher = new indicator_matcher_1.IndicatorMatcher();
    indicatorMatcher.setIndicators(unifiedData.indicators);
    multiCellMatcher = new multi_cell_matcher_1.MultiCellMatcher();
    multiCellMatcher.setEntries(unifiedData.multiCellEntries);
    dotMapper = new dot_mapper_1.DotMapper();
    dotMapper.setData(unifiedData);
    // ---- Braille tracker & overlay ----
    brailleTracker = new braille_tracker_1.BrailleTracker(dotMapper);
    brailleOverlay = new braille_overlay_1.BrailleOverlay();
    const showOverlay = config.get("showBrailleOverlay", true);
    brailleOverlay.setVisible(showOverlay);
    editorOutput = new editor_output_1.EditorOutput();
    editorOutput.setTracker(brailleTracker);
    statusBar = new status_bar_1.StatusBar();
    // ---- Chord detector: process each chord ----
    chordDetector = new chord_detector_1.ChordDetector(chordTimeout, (dots) => {
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
    context.subscriptions.push(vscode.commands.registerCommand("braille.toggleMode", () => {
        isActive = !isActive;
        vscode.commands.executeCommand("setContext", "braille.active", isActive);
        statusBar.update(isActive, stateMachine.getMode());
        if (isActive) {
            vscode.window.showInformationMessage(`Braille Input: ON (${stateMachine.getMode().toUpperCase()})`);
        }
        else {
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
    }));
    // Toggle braille overlay display
    context.subscriptions.push(vscode.commands.registerCommand("braille.toggleOverlay", () => {
        const newVisible = !brailleOverlay.isVisible();
        brailleOverlay.setVisible(newVisible);
        updateOverlay();
        vscode.window.showInformationMessage(`Braille Overlay: ${newVisible ? "ON" : "OFF"}`);
    }));
    // Dot input (called by keybindings)
    context.subscriptions.push(vscode.commands.registerCommand("braille.dotInput", (args) => {
        if (!isActive) {
            return;
        }
        chordDetector.press(args.dot);
    }));
    // ---- Configuration change listener ----
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("braille.chordTimeout")) {
            const newTimeout = vscode.workspace
                .getConfiguration("braille")
                .get("chordTimeout", 50);
            chordDetector.setTimeout(newTimeout);
        }
        if (e.affectsConfiguration("braille.showBrailleOverlay")) {
            const show = vscode.workspace
                .getConfiguration("braille")
                .get("showBrailleOverlay", true);
            brailleOverlay.setVisible(show);
            updateOverlay();
        }
    }));
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
function updateOverlay() {
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
async function handleChord(dots) {
    // Handle space
    if (dots.has(0)) {
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
async function flushAllPending() {
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
async function processCellFallback(dotsKey) {
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
async function emitMultiCellMatch(entry) {
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
async function processCharacter(dotsKey) {
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
    }
    else {
        // No mapping found — insert Unicode braille as fallback
        const braille = dotMapper.dotsKeyToUnicodeBraille(dotsKey);
        await editorOutput.insert(braille, dotsKey);
        stateMachine.onCharacterEmitted();
    }
    updateOverlay();
}
function deactivate() {
    console.log("[Braille] Extension deactivated");
}
//# sourceMappingURL=extension.js.map