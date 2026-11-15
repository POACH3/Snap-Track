import { useRef, type ReactElement } from "react";
import { ACCEPTED_PHOTOS } from "./prepare-photo.ts";

interface PhotoInputOptions {
  /** Open the camera (on phones) rather than the photo library. */
  camera?: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}

/**
 * A hidden file input and a function that opens it, so any button can open the camera or the
 * photo library. It must be called from the tap itself, or iOS refuses to open the picker.
 */
export function usePhotoInput({ camera = false, multiple = false, onFiles }: PhotoInputOptions): {
  open: () => void;
  input: ReactElement;
} {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      hidden
      accept={camera ? "image/*" : ACCEPTED_PHOTOS}
      multiple={multiple}
      {...(camera ? { capture: "environment" } : {})}
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        // Cleared so choosing the same photo again still counts as a change.
        event.currentTarget.value = "";
        if (files.length > 0) onFiles(files);
      }}
    />
  );
  return {
    open: () => {
      ref.current?.click();
    },
    input,
  };
}
