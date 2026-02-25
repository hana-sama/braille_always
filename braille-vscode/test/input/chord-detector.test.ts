import { expect } from "chai";
import { ChordDetector, ChordCallback } from "../../src/input/chord-detector";
import { DotNumber } from "../../src/data/types";

/**
 * ChordDetector uses setTimeout internally.
 * We use a manual approach: press dots, then flush() to force-commit.
 * For timer-based tests, we rely on actual timeouts (kept short).
 */
describe("ChordDetector", () => {
  let emitted: Set<DotNumber>[];
  let detector: ChordDetector;
  const TIMEOUT = 30; // short timeout for tests

  beforeEach(() => {
    emitted = [];
    detector = new ChordDetector(TIMEOUT, dots => {
      emitted.push(new Set(dots));
    });
  });

  afterEach(() => {
    detector.cancel(); // prevent lingering timers
  });

  // ==================================================================
  // Flush-based tests (synchronous, deterministic)
  // ==================================================================
  describe("flush-based behavior", () => {
    it("should emit a single dot when pressed and flushed", () => {
      detector.press(1 as DotNumber);
      detector.flush();

      expect(emitted).to.have.length(1);
      expect(emitted[0].has(1 as DotNumber)).to.be.true;
    });

    it("should accumulate multiple dots into a single chord", () => {
      detector.press(1 as DotNumber);
      detector.press(2 as DotNumber);
      detector.press(4 as DotNumber);
      detector.flush();

      expect(emitted).to.have.length(1);
      expect(emitted[0]).to.deep.equal(new Set([1, 2, 4]));
    });

    it("should not emit duplicates for the same dot pressed twice", () => {
      detector.press(1 as DotNumber);
      detector.press(1 as DotNumber);
      detector.flush();

      expect(emitted).to.have.length(1);
      expect(emitted[0]).to.deep.equal(new Set([1]));
    });

    it("flush should be a no-op when no dots are pending", () => {
      detector.flush();
      expect(emitted).to.have.length(0);
    });
  });

  // ==================================================================
  // Space handling
  // ==================================================================
  describe("space handling", () => {
    it("should emit space immediately (dot 0)", () => {
      detector.press(0 as DotNumber);

      expect(emitted).to.have.length(1);
      expect(emitted[0].has(0 as DotNumber)).to.be.true;
    });

    it("should flush pending chord before emitting space", () => {
      detector.press(1 as DotNumber);
      detector.press(2 as DotNumber);
      detector.press(0 as DotNumber); // space

      // First emission: flushed chord (dots 1,2)
      // Second emission: space (dot 0)
      expect(emitted).to.have.length(2);
      expect(emitted[0]).to.deep.equal(new Set([1, 2]));
      expect(emitted[1]).to.deep.equal(new Set([0]));
    });
  });

  // ==================================================================
  // Cancel
  // ==================================================================
  describe("cancel()", () => {
    it("should discard pending dots without emitting", () => {
      detector.press(1 as DotNumber);
      detector.press(3 as DotNumber);
      detector.cancel();

      expect(emitted).to.have.length(0);
    });
  });

  // ==================================================================
  // Timer-based tests
  // ==================================================================
  describe("timer-based chord commit", () => {
    it("should auto-commit chord after timeout", done => {
      detector.press(1 as DotNumber);
      detector.press(4 as DotNumber);

      // Wait slightly longer than the timeout
      setTimeout(() => {
        expect(emitted).to.have.length(1);
        expect(emitted[0]).to.deep.equal(new Set([1, 4]));
        done();
      }, TIMEOUT + 30);
    });

    it("should reset timer when additional dots arrive", done => {
      detector.press(1 as DotNumber);

      // Press another dot before timeout expires
      setTimeout(() => {
        detector.press(5 as DotNumber);
      }, TIMEOUT / 2);

      // After full timeout from last press, chord should include both dots
      setTimeout(
        () => {
          expect(emitted).to.have.length(1);
          expect(emitted[0]).to.deep.equal(new Set([1, 5]));
          done();
        },
        TIMEOUT + TIMEOUT / 2 + 30
      );
    });
  });

  // ==================================================================
  // setTimeout()
  // ==================================================================
  describe("setTimeout()", () => {
    it("should update the chord timeout", () => {
      detector.setTimeout(10);
      // We can at least verify it doesn't throw
      detector.press(1 as DotNumber);
      detector.flush();
      expect(emitted).to.have.length(1);
    });
  });
});
