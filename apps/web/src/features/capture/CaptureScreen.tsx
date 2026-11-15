import { Camera, Check, ImageOff, ImagePlus, Images, Upload } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Button } from "../../shared/ui/Button.tsx";
import { useUploader } from "../sync/uploader-context.ts";
import { useCapture } from "./capture-context.ts";
import styles from "./CaptureScreen.module.css";
import { usePhotoInput } from "./use-photo-input.tsx";

const filesFrom = (event: DragEvent) => Array.from(event.dataTransfer.files);

/**
 * Capture (SPEC.md §6.1). Phone: Snap or Choose photos. Desktop: Upload images or drag files in.
 * After one photo, the receipt stays open for Add another photo until Done.
 */
export function CaptureScreen() {
  const { draft, preparing, addPhotos, finish } = useCapture();
  const { entries } = useUploader();
  const [dragging, setDragging] = useState(false);

  const camera = usePhotoInput({ camera: true, onFiles: addPhotos });
  const library = usePhotoInput({ multiple: true, onFiles: addPhotos });

  const dropProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => {
      setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      addPhotos(filesFrom(event));
    },
  };

  const uploading = entries.filter(
    (entry) => entry.state === "waiting" || entry.state === "uploading",
  ).length;

  return (
    <div className={styles.screen} {...dropProps}>
      {camera.input}
      {library.input}
      {draft === null ? (
        <>
          <h1>Add a receipt</h1>
          <div className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`} data-testid="drop-zone">
            <Upload size={20} aria-hidden className={styles.dropIcon} />
            <p className={styles.dropText}>Drag receipt images here, or</p>
            <Button busy={preparing} onClick={library.open}>
              <Upload size={18} aria-hidden /> Upload images
            </Button>
          </div>
          <div className={styles.phoneActions}>
            <Button fullWidth busy={preparing} onClick={camera.open}>
              <Camera size={18} aria-hidden /> Snap receipt
            </Button>
            <Button fullWidth variant="secondary" busy={preparing} onClick={library.open}>
              <Images size={18} aria-hidden /> Choose photos
            </Button>
          </div>
          <p className={styles.hint}>
            Photos chosen together become separate receipts. For a long receipt, take one photo, then add the
            rest with <strong>Add another photo</strong>.
          </p>
        </>
      ) : (
        <>
          <h1>New receipt</h1>
          <p className={styles.hint}>
            {draft.photos.length === 1 ? "1 photo" : `${draft.photos.length} photos`}, top of the receipt
            first. Add more for a long receipt, then tap <strong>Done</strong>.
          </p>
          <ol className={styles.photos} aria-label="Photos of this receipt">
            {draft.photos.map((photo, index) => (
              <li key={photo.key} className={styles.photo}>
                {photo.previewUrl === null ? (
                  <div className={styles.noPreview}>
                    <ImageOff size={20} aria-hidden />
                    <span>No preview; uploads as is</span>
                  </div>
                ) : (
                  <img src={photo.previewUrl} alt={`Photo ${index + 1}`} />
                )}
                <span className={styles.position}>{index + 1}</span>
              </li>
            ))}
          </ol>
          <div className={styles.draftActions}>
            <Button variant="secondary" busy={preparing} onClick={camera.open} className={styles.phoneOnly}>
              <Camera size={18} aria-hidden /> Add another photo
            </Button>
            <Button variant="secondary" busy={preparing} onClick={library.open}>
              <ImagePlus size={18} aria-hidden />
              <span className={styles.phoneOnly}>Add from library</span>
              <span className={styles.desktopOnly}>Add another photo</span>
            </Button>
            <Button busy={preparing} onClick={finish}>
              <Check size={18} aria-hidden /> Done
            </Button>
          </div>
        </>
      )}
      {uploading > 0 && (
        <p className={styles.notice} role="status">
          Uploading {uploading === 1 ? "1 receipt" : `${uploading} receipts`}. Keep SnapTrack open until it
          finishes.
        </p>
      )}
    </div>
  );
}
