// ============================================================
// Editor Output: Inserts text into the active VS Code editor
// ============================================================

import * as vscode from "vscode";
import { BrailleTracker } from "./braille-tracker";

/**
 * Handles inserting braille-converted text into the active editor.
 * Optionally records braille dot information for overlay display.
 */
export class EditorOutput {
  private tracker: BrailleTracker | null = null;

  /**
   * Set the braille tracker for recording dot information.
   */
  setTracker(tracker: BrailleTracker): void {
    this.tracker = tracker;
  }

  /**
   * Insert text at the current cursor position in the active editor.
   * If dotsKey is provided, records it in the tracker for overlay display.
   */
  async insert(text: string, dotsKey?: string): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return false;
    }

    // Capture cursor position before insert for tracker
    const position = editor.selection.active;

    const result = await editor.edit(editBuilder => {
      editor.selections.forEach(selection => {
        if (selection.isEmpty) {
          editBuilder.insert(selection.active, text);
        } else {
          editBuilder.replace(selection, text);
        }
      });
    });

    // Record in tracker if dotsKey provided
    if (result && this.tracker && dotsKey !== undefined) {
      this.tracker.record(position.line, position.character, dotsKey);
    }

    return result;
  }

  /**
   * Insert a space character.
   */
  async insertSpace(): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    const position = editor?.selection.active;

    const result = await this.insert(" ");

    if (result && this.tracker && editor && position) {
      this.tracker.recordSpace(position.line, position.character);
    }

    return result;
  }

  /**
   * Insert a newline.
   */
  async insertNewline(): Promise<boolean> {
    return this.insert("\n");
  }

  /**
   * Delete the last character (backspace).
   */
  async backspace(): Promise<void> {
    await vscode.commands.executeCommand("deleteLeft");
  }
}
