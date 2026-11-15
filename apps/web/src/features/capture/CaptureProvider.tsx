import { newId } from "@snaptrack/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useUploader } from "../sync/uploader-context.ts";
import { CaptureContext, type Capture, type Draft, type DraftPhoto } from "./capture-context.ts";
import { canPreview, isPhotoFile, preparePhoto } from "./prepare-photo.ts";

export const CAPTURE_PATH = "/capture";

/** When the photo was taken, as well as the browser can tell (the file's time; now for a fresh photo). */
const takenAt = (file: File) =>
  new Date(file.lastModified > 0 ? file.lastModified : Date.now()).toISOString();

async function toDraftPhoto(file: File): Promise<DraftPhoto> {
  const blob = await preparePhoto(file);
  return { key: newId(), blob, previewUrl: canPreview(file, blob) ? URL.createObjectURL(blob) : null };
}

function revoke(draft: Draft | null) {
  for (const photo of draft?.photos ?? [])
    if (photo.previewUrl !== null) URL.revokeObjectURL(photo.previewUrl);
}

/**
 * Holds the receipt being captured. It sits above every screen, so the tab bar's Snap button
 * can start a receipt from anywhere. The draft uploads on Done or when the person leaves the
 * capture screen (SPEC.md §6.1), so extraction always sees every photo.
 */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const uploader = useUploader();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preparing, setPreparing] = useState(false);
  const draftRef = useRef(draft);

  const finish = useCallback(() => {
    const current = draftRef.current;
    if (current === null || current.photos.length === 0) return;
    uploader.enqueue({
      id: current.id,
      capturedAt: current.capturedAt,
      images: current.photos.map((photo) => photo.blob),
    });
    revoke(current);
    draftRef.current = null;
    setDraft(null);
  }, [uploader]);

  // Leaving the capture screen uploads the draft (on route change, so React's development
  // double-mounting can't trigger it).
  useEffect(() => {
    if (pathname !== CAPTURE_PATH) finish();
  }, [pathname, finish]);

  const addPhotos = useCallback(
    (chosen: readonly File[]) => {
      const files = chosen.filter(isPhotoFile);
      if (files.length === 0) return;
      setPreparing(true);
      void (async () => {
        try {
          const current = draftRef.current;
          if (current === null && files.length > 1) {
            // Each photo chosen together is its own receipt (SPEC.md §6.1), uploaded at once.
            for (const file of files) {
              const photo = await toDraftPhoto(file);
              if (photo.previewUrl !== null) URL.revokeObjectURL(photo.previewUrl);
              uploader.enqueue({ id: newId(), capturedAt: takenAt(file), images: [photo.blob] });
            }
            void navigate("/");
            return;
          }
          const photos = await Promise.all(files.map(toDraftPhoto));
          const base = draftRef.current ?? {
            id: newId(),
            capturedAt: takenAt(files[0] ?? new File([], "")),
            photos: [],
          };
          const next = { ...base, photos: [...base.photos, ...photos] };
          draftRef.current = next;
          setDraft(next);
          if (pathname !== CAPTURE_PATH) void navigate(CAPTURE_PATH);
        } finally {
          setPreparing(false);
        }
      })();
    },
    [uploader, navigate, pathname],
  );

  const capture = useMemo<Capture>(
    () => ({ draft, preparing, addPhotos, finish }),
    [draft, preparing, addPhotos, finish],
  );
  return <CaptureContext.Provider value={capture}>{children}</CaptureContext.Provider>;
}
