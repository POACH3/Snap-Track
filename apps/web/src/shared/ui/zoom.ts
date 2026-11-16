// Pure geometry for the image viewer: zoom limits, keeping a point still while zooming, and
// keeping the content inside its frame. Kept apart from the component so it reads plainly.

export interface View {
  /** 1 is fit to width. */
  readonly scale: number;
  /** Where the content's top-left corner is, in frame pixels. */
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
export const FIT: View = { scale: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keeps the content covering the frame: no gap on a side unless the content is smaller than the frame there. */
export function bounded(view: View, content: Size, frame: Size): View {
  const width = content.width * view.scale;
  const height = content.height * view.scale;
  const x = width <= frame.width ? (frame.width - width) / 2 : clamp(view.x, frame.width - width, 0);
  const y = height <= frame.height ? 0 : clamp(view.y, frame.height - height, 0);
  return { scale: view.scale, x, y };
}

/** Zooms to `scale` while the frame point (`px`, `py`) stays over the same spot of the content. */
export function zoomAt(view: View, scale: number, px: number, py: number): View {
  const next = clamp(scale, MIN_SCALE, MAX_SCALE);
  const ratio = next / view.scale;
  return { scale: next, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}
