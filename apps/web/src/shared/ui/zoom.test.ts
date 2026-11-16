import { describe, expect, it } from "vitest";
import { FIT, bounded, zoomAt } from "./zoom.ts";

const frame = { width: 300, height: 400 };
const content = { width: 300, height: 900 };

describe("image viewer geometry", () => {
  it("keeps the point under the fingers still while zooming", () => {
    const view = zoomAt(FIT, 2, 150, 100);
    // The content point under (150, 100) was (150, 100); at 2× it maps to 300 + x, 200 + y.
    expect(view.x + 150 * view.scale).toBe(150);
    expect(view.y + 100 * view.scale).toBe(100);
  });

  it("limits zoom to 1× – 5×", () => {
    expect(zoomAt(FIT, 0.2, 0, 0).scale).toBe(1);
    expect(zoomAt(FIT, 20, 0, 0).scale).toBe(5);
  });

  it("never lets the content leave a gap at the edges", () => {
    expect(bounded({ scale: 2, x: 50, y: 50 }, content, frame)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(bounded({ scale: 2, x: -1000, y: -5000 }, content, frame)).toEqual({
      scale: 2,
      x: -300,
      y: -1400,
    });
  });

  it("scrolls a long receipt at fit width, but not sideways", () => {
    expect(bounded({ scale: 1, x: -40, y: -200 }, content, frame)).toEqual({ scale: 1, x: 0, y: -200 });
  });

  it("centers content narrower than the frame and pins short content to the top", () => {
    expect(bounded({ scale: 1, x: 0, y: -50 }, { width: 200, height: 100 }, frame)).toEqual({
      scale: 1,
      x: 50,
      y: 0,
    });
  });
});
