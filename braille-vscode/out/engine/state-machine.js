"use strict";
// ============================================================
// State Machine: Manages the current braille mode
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateMachine = void 0;
/**
 * Manages the current braille input mode and handles transitions
 * triggered by indicator sequences.
 */
class StateMachine {
    constructor(initialMode = "grade1") {
        this.currentMode = "grade1";
        this.modeStack = []; // For nested mode switches
        this.activeScope = null;
        this.symbolCount = 0; // Track symbols entered in current mode
        this.pendingModifier = null;
        this.onModeChange = null;
        this.currentMode = initialMode;
    }
    /** Get the current active mode */
    getMode() {
        return this.currentMode;
    }
    /** Get the active scope (if any) */
    getScope() {
        return this.activeScope;
    }
    /** Register a callback for mode changes */
    setModeChangeCallback(cb) {
        this.onModeChange = cb;
    }
    /**
     * Process an indicator and potentially switch modes.
     * Returns true if a mode transition occurred.
     */
    processIndicator(indicator) {
        // Modifier indicators (capital, numeric, typeform) don't switch modes
        if (indicator.indicatorType === "modifier") {
            if (indicator.action === "enter" && indicator.modifier) {
                this.pendingModifier = indicator.modifier;
            }
            else {
                this.pendingModifier = null;
            }
            return true;
        }
        // Mode-switch indicators
        if (indicator.action === "enter") {
            return this.enterMode(indicator);
        }
        else {
            return this.exitMode(indicator);
        }
    }
    /**
     * Consume and return the pending modifier (if any).
     * Returns the modifier kind and clears it.
     */
    consumeModifier() {
        const mod = this.pendingModifier;
        this.pendingModifier = null;
        return mod;
    }
    /**
     * Check if there is a pending modifier.
     */
    hasPendingModifier() {
        return this.pendingModifier !== null;
    }
    /**
     * Called after each character is emitted.
     * For 'symbol' scope, automatically returns to base mode after one character.
     */
    onCharacterEmitted() {
        if (this.activeScope === "symbol") {
            this.symbolCount++;
            if (this.symbolCount >= 1) {
                this.returnToBase();
            }
        }
    }
    /**
     * Handle space input.
     * For 'word' scope, space triggers return to base mode.
     */
    onSpace() {
        if (this.activeScope === "word") {
            this.returnToBase();
        }
    }
    /** Reset to initial state */
    reset() {
        this.currentMode = "grade1";
        this.modeStack = [];
        this.activeScope = null;
        this.symbolCount = 0;
        this.pendingModifier = null;
    }
    enterMode(indicator) {
        const oldMode = this.currentMode;
        const newMode = indicator.targetMode;
        if (oldMode === newMode && this.activeScope === indicator.scope) {
            return false; // Already in this mode with same scope
        }
        // Push current mode for potential nesting
        this.modeStack.push(oldMode);
        this.currentMode = newMode;
        this.activeScope = indicator.scope;
        this.symbolCount = 0;
        if (this.onModeChange) {
            this.onModeChange(oldMode, newMode, indicator);
        }
        return true;
    }
    exitMode(indicator) {
        if (this.currentMode === "grade1" && this.modeStack.length === 0) {
            return false; // Already at base, nothing to exit
        }
        const oldMode = this.currentMode;
        this.returnToBase();
        return oldMode !== this.currentMode;
    }
    returnToBase() {
        const oldMode = this.currentMode;
        this.currentMode =
            this.modeStack.length > 0 ? this.modeStack.pop() : "grade1";
        this.activeScope = null;
        this.symbolCount = 0;
        if (this.onModeChange && oldMode !== this.currentMode) {
            this.onModeChange(oldMode, this.currentMode, {
                id: "auto_return",
                dots: [],
                dotsKey: "",
                action: "exit",
                targetMode: this.currentMode,
                scope: "symbol",
                indicatorType: "mode_switch",
                tags: []
            });
        }
    }
}
exports.StateMachine = StateMachine;
//# sourceMappingURL=state-machine.js.map