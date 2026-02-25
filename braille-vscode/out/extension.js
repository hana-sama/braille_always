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
const dot_mapper_1 = require("./engine/dot-mapper");
const editor_output_1 = require("./output/editor-output");
const status_bar_1 = require("./output/status-bar");
let isActive = false;
let chordDetector;
let stateMachine;
let indicatorMatcher;
let dotMapper;
let editorOutput;
let statusBar;
let unifiedData;
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
    dotMapper = new dot_mapper_1.DotMapper();
    dotMapper.setData(unifiedData);
    editorOutput = new editor_output_1.EditorOutput();
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
            stateMachine.reset();
            vscode.window.showInformationMessage("Braille Input: OFF");
        }
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
    }));
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
async function handleChord(dots) {
    // Handle space
    if (dots.has(0)) {
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
async function processCharacter(dotsKey) {
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
    }
    else {
        // No mapping found — insert Unicode braille as fallback
        // Clear any pending modifier since we can't apply it
        stateMachine.consumeModifier();
        const braille = dotMapper.dotsKeyToUnicodeBraille(dotsKey);
        await editorOutput.insert(braille);
        stateMachine.onCharacterEmitted();
    }
}
function deactivate() {
    console.log("[Braille] Extension deactivated");
}
//# sourceMappingURL=extension.js.map