import { Camera, ChartColumn, Receipt, Search, Settings, Upload, type LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useCapture } from "../features/capture/capture-context.ts";
import { CAPTURE_PATH, CaptureProvider } from "../features/capture/CaptureProvider.tsx";
import { usePhotoInput } from "../features/capture/use-photo-input.tsx";
import { UploaderProvider } from "../features/sync/uploader.tsx";
import { Button } from "../shared/ui/Button.tsx";
import styles from "./AppShell.module.css";

interface Section {
  to: string;
  label: string;
  icon: LucideIcon;
}

const RECEIPTS: Section = { to: "/", label: "Receipts", icon: Receipt };
const ANALYTICS: Section = { to: "/analytics", label: "Analytics", icon: ChartColumn };
const SEARCH: Section = { to: "/search", label: "Search", icon: Search };
const SETTINGS: Section = { to: "/settings", label: "Settings", icon: Settings };
const SECTIONS = [RECEIPTS, ANALYTICS, SEARCH, SETTINGS];

/**
 * The frame around every signed-in screen. Below 640px: a glass tab bar with the raised Snap
 * button in its center. Wider: side navigation with Upload images (docs/DESIGN.md).
 */
export function AppShell() {
  return (
    <UploaderProvider>
      <CaptureProvider>
        <Frame />
      </CaptureProvider>
    </UploaderProvider>
  );
}

function Frame() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { addPhotos } = useCapture();
  const snap = usePhotoInput({ camera: true, onFiles: addPhotos });

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <span className={styles.brand}>SnapTrack</span>
      </header>

      <nav className={styles.sideNav} aria-label="Main">
        {/* The capture screen has its own Upload images; one main button per screen (docs/DESIGN.md). */}
        {pathname !== CAPTURE_PATH && (
          <Button
            fullWidth
            onClick={() => {
              void navigate(CAPTURE_PATH);
            }}
          >
            <Upload size={18} aria-hidden /> Upload images
          </Button>
        )}
        <ul className={styles.sideList}>
          {SECTIONS.map((section) => (
            <li key={section.to}>
              <NavItem section={section} className={styles.sideItem} />
            </li>
          ))}
        </ul>
      </nav>

      <main className={styles.content}>
        <Outlet />
      </main>

      <nav className={styles.tabBar} aria-label="Main">
        {snap.input}
        <NavItem section={RECEIPTS} className={styles.tab} />
        <NavItem section={ANALYTICS} className={styles.tab} />
        <button type="button" className={styles.snap} aria-label="Snap receipt" onClick={snap.open}>
          <Camera size={26} aria-hidden />
        </button>
        <NavItem section={SEARCH} className={styles.tab} />
        <NavItem section={SETTINGS} className={styles.tab} />
      </nav>
    </div>
  );
}

function NavItem({ section, className }: { section: Section; className: string | undefined }) {
  const Icon = section.icon;
  return (
    <NavLink
      to={section.to}
      end={section.to === "/"}
      className={({ isActive }) =>
        [className, isActive ? styles.active : undefined].filter(Boolean).join(" ")
      }
    >
      <Icon size={20} aria-hidden />
      <span>{section.label}</span>
    </NavLink>
  );
}
