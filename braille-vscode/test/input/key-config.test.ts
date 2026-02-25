import { expect } from "chai";
import {
  KEY_LAYOUTS,
  getKeyLayout,
  dotToKeyChar
} from "../../src/input/key-config";
import { DotNumber } from "../../src/data/types";

describe("key-config", () => {
  // ==================================================================
  // KEY_LAYOUTS
  // ==================================================================
  describe("KEY_LAYOUTS", () => {
    it("should have fds-jkl layout", () => {
      expect(KEY_LAYOUTS["fds-jkl"]).to.deep.equal({
        f: 1,
        d: 2,
        s: 3,
        j: 4,
        k: 5,
        l: 6
      });
    });

    it("should have dwq-kop layout", () => {
      expect(KEY_LAYOUTS["dwq-kop"]).to.deep.equal({
        d: 1,
        w: 2,
        q: 3,
        k: 4,
        o: 5,
        p: 6
      });
    });
  });

  // ==================================================================
  // getKeyLayout()
  // ==================================================================
  describe("getKeyLayout()", () => {
    it("should return the named layout", () => {
      const layout = getKeyLayout("dwq-kop");
      expect(layout.d).to.equal(1);
      expect(layout.p).to.equal(6);
    });

    it("should fall back to fds-jkl for unknown names", () => {
      const layout = getKeyLayout("nonexistent");
      expect(layout.f).to.equal(1);
      expect(layout.l).to.equal(6);
    });
  });

  // ==================================================================
  // dotToKeyChar()
  // ==================================================================
  describe("dotToKeyChar()", () => {
    it("should return the correct key for a dot in fds-jkl layout", () => {
      const layout = getKeyLayout("fds-jkl");
      expect(dotToKeyChar(layout, 1 as DotNumber)).to.equal("f");
      expect(dotToKeyChar(layout, 3 as DotNumber)).to.equal("s");
      expect(dotToKeyChar(layout, 6 as DotNumber)).to.equal("l");
    });

    it("should return undefined for dot 0 (not in layout)", () => {
      const layout = getKeyLayout("fds-jkl");
      expect(dotToKeyChar(layout, 0 as DotNumber)).to.be.undefined;
    });
  });
});
