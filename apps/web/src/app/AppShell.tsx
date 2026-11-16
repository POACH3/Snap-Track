import {
  Camera,
  ChartColumn,
  ChevronDown,
  LibraryBig,
  LogOut,
  Receipt,
  Settings,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { matchPath, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { useLogout, useSession } from "../features/auth/use-session.ts";
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
const BUDGET: Section = { to: "/budget", label: "Budget", icon: Wallet };
const LIBRARY: Section = { to: "/library", label: "Library", icon: LibraryBig };
const SETTINGS: Section = { to: "/settings", label: "Settings", icon: Settings };
const SIDE_SECTIONS = [RECEIPTS, ANALYTICS, BUDGET, LIBRARY, SETTINGS];

/**
 * The frame around every signed-in screen (docs/DESIGN.md, "Components"). Below 640px: a glass
 * tab bar with the raised Snap button in its center, hidden on the receipt page, whose edit card
 * holds its actions. Wider: side navigation with the profile button and Upload receipt.
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
  const onReceiptPage = matchPath("/receipts/:id", pathname) !== null;

  return (
    <div className={styles.shell}>
      <ScrollRestoration />
      <nav className={styles.sideNav} aria-label="Main">
        <span className={styles.brand}>SnapTrack</span>
        <ProfileButton />
        <ul className={styles.sideList}>
          {SIDE_SECTIONS.map((section) => (
            <li key={section.to}>
              <NavItem section={section} className={styles.sideItem} />
            </li>
          ))}
        </ul>
        {/* The capture screen has its own upload button; one main button per screen (docs/DESIGN.md). */}
        {pathname !== CAPTURE_PATH && (
          <Button
            fullWidth
            className={styles.upload}
            onClick={() => {
              void navigate(CAPTURE_PATH);
            }}
          >
            <Upload size={18} aria-hidden /> Upload receipt
          </Button>
        )}
      </nav>

      <main className={onReceiptPage ? `${styles.content} ${styles.fullHeight}` : styles.content}>
        <Outlet />
      </main>

      {!onReceiptPage && (
        <nav className={styles.tabBar} aria-label="Main">
          {snap.input}
          <NavItem section={RECEIPTS} className={styles.tab} />
          <NavItem section={ANALYTICS} className={styles.tab} />
          <button type="button" className={styles.snap} aria-label="Snap receipt" onClick={snap.open}>
            <Camera size={26} aria-hidden />
          </button>
          <NavItem section={LIBRARY} className={styles.tab} />
          <NavItem section={SETTINGS} className={styles.tab} />
        </nav>
      )}
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

/** The signed-in person, with a menu holding their name and Log out. */
function ProfileButton() {
  const session = useSession();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = session.data;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (user === undefined || user === null) return null;
  return (
    <div ref={ref} className={styles.profile}>
      <button
        type="button"
        className={styles.profileButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Profile: ${user.displayName}`}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span className={styles.avatar} aria-hidden>
          {user.displayName.charAt(0).toUpperCase()}
        </span>
        <span className={styles.profileName}>{user.displayName}</span>
        <ChevronDown size={18} aria-hidden className={styles.profileChevron} />
      </button>
      {open && (
        <div role="menu" className={styles.menu}>
          <p className={styles.menuName}>
            {user.displayName}
            <span>{user.username}</span>
          </p>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            disabled={logout.isPending}
            onClick={() => {
              logout.mutate({});
            }}
          >
            <LogOut size={18} aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
