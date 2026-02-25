import { expect } from "chai";
import {
  StateMachine,
  ModeChangeCallback
} from "../../src/engine/state-machine";
import {
  Mode,
  IndicatorDef,
  IndicatorScope,
  IndicatorType,
  ModifierKind
} from "../../src/data/types";

/** Helper to create an IndicatorDef */
function makeIndicator(
  targetMode: Mode,
  action: "enter" | "exit" = "enter",
  scope: IndicatorScope = "symbol",
  indicatorType: IndicatorType = "mode_switch",
  modifier?: ModifierKind
): IndicatorDef {
  return {
    id: `${action}_${targetMode}_${scope}`,
    dots: [],
    dotsKey: "",
    action,
    targetMode,
    scope,
    indicatorType,
    modifier,
    tags: []
  };
}

describe("StateMachine", () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine("grade1");
  });

  // ==================================================================
  // Initial state
  // ==================================================================
  describe("initial state", () => {
    it("should start in grade1 mode", () => {
      expect(sm.getMode()).to.equal("grade1");
    });

    it("should have no active scope", () => {
      expect(sm.getScope()).to.be.null;
    });

    it("should accept a custom initial mode", () => {
      const custom = new StateMachine("kana");
      expect(custom.getMode()).to.equal("kana");
    });
  });

  // ==================================================================
  // processIndicator() — enter
  // ==================================================================
  describe("processIndicator() → enter", () => {
    it("should switch to the target mode", () => {
      const indicator = makeIndicator("kana", "enter", "passage");
      const changed = sm.processIndicator(indicator);

      expect(changed).to.be.true;
      expect(sm.getMode()).to.equal("kana");
      expect(sm.getScope()).to.equal("passage");
    });

    it("should return false when already in same mode with same scope", () => {
      const indicator = makeIndicator("kana", "enter", "passage");
      sm.processIndicator(indicator);

      const changed = sm.processIndicator(indicator);
      expect(changed).to.be.false;
    });

    it("should invoke ModeChangeCallback on transition", () => {
      const transitions: { old: Mode; new_: Mode; id: string }[] = [];
      sm.setModeChangeCallback((oldMode, newMode, indicator) => {
        transitions.push({ old: oldMode, new_: newMode, id: indicator.id });
      });

      sm.processIndicator(makeIndicator("kana", "enter", "passage"));
      expect(transitions).to.have.length(1);
      expect(transitions[0].old).to.equal("grade1");
      expect(transitions[0].new_).to.equal("kana");
    });
  });

  // ==================================================================
  // processIndicator() — exit
  // ==================================================================
  describe("processIndicator() → exit", () => {
    it("should return to previous mode", () => {
      sm.processIndicator(makeIndicator("kana", "enter", "passage"));
      expect(sm.getMode()).to.equal("kana");

      const changed = sm.processIndicator(makeIndicator("kana", "exit"));
      expect(changed).to.be.true;
      expect(sm.getMode()).to.equal("grade1");
    });

    it("should return false when already at base mode", () => {
      const changed = sm.processIndicator(makeIndicator("grade1", "exit"));
      expect(changed).to.be.false;
    });
  });

  // ==================================================================
  // Symbol scope — auto-return after 1 character
  // ==================================================================
  describe("symbol scope auto-return", () => {
    it("should return to base mode after one character is emitted", () => {
      sm.processIndicator(makeIndicator("kana", "enter", "symbol"));
      expect(sm.getMode()).to.equal("kana");

      sm.onCharacterEmitted();
      expect(sm.getMode()).to.equal("grade1");
      expect(sm.getScope()).to.be.null;
    });

    it("should not auto-return for passage scope", () => {
      sm.processIndicator(makeIndicator("kana", "enter", "passage"));
      expect(sm.getMode()).to.equal("kana");

      sm.onCharacterEmitted();
      expect(sm.getMode()).to.equal("kana"); // still in kana
    });
  });

  // ==================================================================
  // Word scope — auto-return on space
  // ==================================================================
  describe("word scope auto-return", () => {
    it("should return to base mode on space", () => {
      sm.processIndicator(makeIndicator("kana", "enter", "word"));
      expect(sm.getMode()).to.equal("kana");

      sm.onSpace();
      expect(sm.getMode()).to.equal("grade1");
      expect(sm.getScope()).to.be.null;
    });

    it("should not auto-return on character emit (word scope)", () => {
      sm.processIndicator(makeIndicator("kana", "enter", "word"));
      sm.onCharacterEmitted();
      expect(sm.getMode()).to.equal("kana"); // still in kana
    });

    it("should not trigger word-scope return in passage mode", () => {
      sm.processIndicator(makeIndicator("kana", "enter", "passage"));
      sm.onSpace();
      expect(sm.getMode()).to.equal("kana"); // still in kana
    });
  });

  // ==================================================================
  // Mode stacking (nested modes)
  // ==================================================================
  describe("mode stacking", () => {
    it("should support nested mode switches", () => {
      // grade1 → kana → nemeth
      sm.processIndicator(makeIndicator("kana", "enter", "passage"));
      expect(sm.getMode()).to.equal("kana");

      sm.processIndicator(makeIndicator("nemeth", "enter", "passage"));
      expect(sm.getMode()).to.equal("nemeth");

      // exit nemeth → back to kana
      sm.processIndicator(makeIndicator("nemeth", "exit"));
      expect(sm.getMode()).to.equal("kana");

      // exit kana → back to grade1
      sm.processIndicator(makeIndicator("kana", "exit"));
      expect(sm.getMode()).to.equal("grade1");
    });
  });

  // ==================================================================
  // reset()
  // ==================================================================
  describe("reset()", () => {
    it("should return to grade1 and clear all state", () => {
      sm.processIndicator(makeIndicator("kana", "enter", "passage"));
      sm.processIndicator(makeIndicator("nemeth", "enter", "passage"));
      expect(sm.getMode()).to.equal("nemeth");

      sm.reset();
      expect(sm.getMode()).to.equal("grade1");
      expect(sm.getScope()).to.be.null;
    });
  });

  // ==================================================================
  // Modifier indicators (capital, numeric, typeform)
  // ==================================================================
  describe("modifier indicators", () => {
    it("should set pending modifier for capital indicator", () => {
      const capital = makeIndicator(
        "grade1",
        "enter",
        "symbol",
        "modifier",
        "capital"
      );
      const result = sm.processIndicator(capital);

      expect(result).to.be.true;
      expect(sm.getMode()).to.equal("grade1"); // mode should NOT change
      expect(sm.hasPendingModifier()).to.be.true;
    });

    it("consumeModifier() should return the modifier and clear it", () => {
      const capital = makeIndicator(
        "grade1",
        "enter",
        "symbol",
        "modifier",
        "capital"
      );
      sm.processIndicator(capital);

      const mod = sm.consumeModifier();
      expect(mod).to.equal("capital");
      expect(sm.hasPendingModifier()).to.be.false;
    });

    it("consumeModifier() should return null when no modifier pending", () => {
      expect(sm.consumeModifier()).to.be.null;
    });

    it("should clear modifier on exit action", () => {
      const enter = makeIndicator(
        "grade1",
        "enter",
        "symbol",
        "modifier",
        "capital"
      );
      sm.processIndicator(enter);
      expect(sm.hasPendingModifier()).to.be.true;

      const exit = makeIndicator(
        "grade1",
        "exit",
        "symbol",
        "modifier",
        "capital"
      );
      sm.processIndicator(exit);
      expect(sm.hasPendingModifier()).to.be.false;
    });

    it("should not affect mode when processing modifier", () => {
      sm.processIndicator(makeIndicator("kana", "enter", "passage"));
      expect(sm.getMode()).to.equal("kana");

      const capital = makeIndicator(
        "grade1",
        "enter",
        "symbol",
        "modifier",
        "capital"
      );
      sm.processIndicator(capital);
      expect(sm.getMode()).to.equal("kana"); // still kana!
    });

    it("reset() should clear pending modifier", () => {
      const capital = makeIndicator(
        "grade1",
        "enter",
        "symbol",
        "modifier",
        "capital"
      );
      sm.processIndicator(capital);

      sm.reset();
      expect(sm.hasPendingModifier()).to.be.false;
    });
  });
});
