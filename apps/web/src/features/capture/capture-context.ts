import { createContext, useContext } from "react";

export interface DraftPhoto {
  key: string;
  blob: Blob;
  /** Object URL for showing it, or null if the browser can't show it (e.g. HEIC in Chrome). */
  previewUrl: string | null;
}

/** A receipt being captured: photos in order, uploaded together on Done (SPEC.md §6.1). */
export interface Draft {
  id: string;
  capturedAt: string;
  photos: readonly DraftPhoto[];
}

export interface Capture {
  draft: Draft | null;
  /** True while chosen photos are being shrunk. */
  preparing: boolean;
  /**
   * Photos just taken or chosen. Several chosen together each become their own receipt and
   * upload at once; a single one starts (or, with a draft open, joins) the draft.
   */
  addPhotos: (files: readonly File[]) => void;
  /** Uploads the draft. */
  finish: () => void;
}

export const CaptureContext = createContext<Capture | null>(null);

export function useCapture(): Capture {
  const capture = useContext(CaptureContext);
  if (capture === null) throw new Error("useCapture needs a CaptureProvider above it");
  return capture;
}
