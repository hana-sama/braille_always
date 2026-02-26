"use strict";
// ============================================================
// Braille Overlay: Displays braille dots as after-text decorations
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
exports.BrailleOverlay = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Manages VS Code TextEditorDecorationType to display
 * Unicode braille dots as after-text decorations at the
 * end of each line in the active editor.
 */
class BrailleOverlay {
    constructor() {
        this.visible = true;
        this.decorationType = vscode.window.createTextEditorDecorationType({
            // Base styling — contentText is set per-range in update()
            isWholeLine: false
        });
    }
    /**
     * Refresh the braille overlay decorations for the given editor.
     */
    update(editor, tracker) {
        if (!this.visible) {
            editor.setDecorations(this.decorationType, []);
            return;
        }
        const decorations = [];
        for (const lineNum of tracker.getTrackedLines()) {
            const brailleText = tracker.getLine(lineNum);
            if (!brailleText) {
                continue;
            }
            // Verify line exists in the document
            if (lineNum >= editor.document.lineCount) {
                continue;
            }
            const line = editor.document.lineAt(lineNum);
            decorations.push({
                range: new vscode.Range(lineNum, line.range.end.character, lineNum, line.range.end.character),
                renderOptions: {
                    after: {
                        contentText: `    ${brailleText}`,
                        color: new vscode.ThemeColor("editorCodeLens.foreground"),
                        fontStyle: "normal",
                        fontWeight: "normal",
                        margin: "0 0 0 2em"
                    }
                }
            });
        }
        editor.setDecorations(this.decorationType, decorations);
    }
    /**
     * Toggle overlay visibility.
     */
    setVisible(visible) {
        this.visible = visible;
    }
    /**
     * Check if the overlay is currently visible.
     */
    isVisible() {
        return this.visible;
    }
    /**
     * Dispose the decoration type.
     */
    dispose() {
        this.decorationType.dispose();
    }
}
exports.BrailleOverlay = BrailleOverlay;
//# sourceMappingURL=braille-overlay.js.map