// ============================================================
// Braille Overlay: Displays braille dots as after-text decorations
// ============================================================

import * as vscode from "vscode";
import { BrailleTracker } from "./braille-tracker";

/**
 * Manages VS Code TextEditorDecorationType to display
 * Unicode braille dots as after-text decorations at the
 * end of each line in the active editor.
 */
export class BrailleOverlay {
  private decorationType: vscode.TextEditorDecorationType;
  private visible: boolean = true;

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      // Base styling — contentText is set per-range in update()
      isWholeLine: false
    });
  }

  /**
   * Refresh the braille overlay decorations for the given editor.
   */
  update(editor: vscode.TextEditor, tracker: BrailleTracker): void {
    if (!this.visible) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];

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
        range: new vscode.Range(
          lineNum,
          line.range.end.character,
          lineNum,
          line.range.end.character
        ),
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
  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  /**
   * Check if the overlay is currently visible.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Dispose the decoration type.
   */
  dispose(): void {
    this.decorationType.dispose();
  }
}
