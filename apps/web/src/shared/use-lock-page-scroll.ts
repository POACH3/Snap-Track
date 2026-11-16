import { useEffect } from "react";

/**
 * Stops the page itself from scrolling or being dragged while `active`, as on the phone receipt
 * page, whose cards stay put and scroll inside (docs/DESIGN.md, "Receipts screens"). iOS lets a
 * page that exactly fits the screen be dragged anyway, so the document's own overflow is turned
 * off too. Everything is put back when `active` ends or the screen closes.
 */
export function useLockPageScroll(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const targets = [document.documentElement, document.body];
    const saved = targets.map((el) => ({
      overflow: el.style.overflow,
      overscroll: el.style.overscrollBehavior,
    }));
    for (const el of targets) {
      el.style.overflow = "hidden";
      el.style.overscrollBehavior = "none";
    }
    window.scrollTo(0, 0);
    return () => {
      targets.forEach((el, index) => {
        el.style.overflow = saved[index]?.overflow ?? "";
        el.style.overscrollBehavior = saved[index]?.overscroll ?? "";
      });
    };
  }, [active]);
}
