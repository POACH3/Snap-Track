# SnapTrack UI Design Guide

*Read this before adding or changing any UI or CSS.* Values come from one shared theme file, `apps/web/src/app/theme.css`, and components are styled with CSS Modules (see "Theme tokens"). That file is the source of truth for values. Items marked **(proposed)** are decisions not yet confirmed by the developer.

Visual reference: the style preview at https://claude.ai/artifact/K5vEpRoi5Pj1N51a5NbZ3a (private to the developer) shows these values on sample phone and desktop screens.

## How to use this guide

*Tells an agent or contributor when to consult this file and what to do when it disagrees with the code.*

- Reuse a shared class, component or variable before writing new CSS.
- If a value you need is missing here, ask the developer rather than inventing one.
- If this guide and the code disagree, follow the guide for new work and log the mismatch under "Known inconsistencies" (see `.claude/rules/ui-design.md`).

## Look and feel

*Describes the visual character of the app in words, so new screens feel like they belong.*

SnapTrack should feel calm, quiet and trustworthy: a dark charcoal room with a deep forest-green accent, where the layers that float (bars, modals, toasts) are frosted glass and everything else is solid and easy to read. Corners are soft. It should not feel flashy, neon, or like a trading app; color is used sparingly so that green means "main action" and red means "destructive" or "price went up".

- **Theme.** Dark and light, from the same role-named tokens (see "Theme tokens" and "Light theme colors"). The app follows the device setting (`prefers-color-scheme`) by default, and each person can choose Dark, Light or System in Settings. Dark is the base design; light is a swap of token values.
- **Surfaces.** Solid, layered charcoal for the page, cards, tables and lists. Frosted glass only on floating layers: top bar, tab bar, modals, sheets, toasts. See "Surfaces".
- **Overlays.** Modals and confirm modals use the strong glass (more see-through, light blur) over a dark scrim. See "Overlays".
- **Notifications.** Toasts for results of an action; inline messages for field errors. Never the browser's `alert()` or `confirm()`. See "Overlays".
- **Accent.** One accent: forest green. It marks the main action, the selected tab, focus, success, and category chips that are highlighted. Status colors (warning amber, danger red) are separate from the accent.
- **Shape.** Soft corners (16px panels, 12px controls, full round chips). 1px borders. Shadows only on floating layers and raised cards.
- **Text.** Near-white headings, soft gray-green body text, muted gray for secondary text. No gradients or special effects on text.
- **Density.** Phone screens (capture, queue, quick review) are spacious with large touch targets. Desktop screens (import, full manual entry, review, analytics) can be denser: tables and side-by-side layouts.

## Behavior

*Describes how the interface responds to input, so interactions feel consistent.*

- **Movement:** Nothing moves or lifts on hover. Only color, border and background change. **(proposed)**
- **Transitions:** Modals and toasts fade (and toasts slide a few pixels) in and out. Page changes have no animation. **(proposed)**
- **Loading:** Page frame (top bar, tab bar) shows first, then content. Cached data (TanStack Query) shows right away and refreshes quietly. A loading indicator shows only after a short delay. See "Loading".
- **Hover on buttons and other controls:** Main button gets the lighter green (`--accent-hover`). Secondary buttons get a lighter border. Ghost buttons get the raised surface fill. Destructive buttons get a stronger red tint.
- **Focus:** 2px outline in `--accent-text`, 2px offset, on `:focus-visible`. Keyboard focus must always be visible.
- **Disabled:** 45% opacity, `not-allowed` cursor, no hover change.
- **Timing:** 160ms with `cubic-bezier(0.2, 0.8, 0.2, 1)` for color and border changes; 200ms for modal and toast fades. All motion is turned off under `prefers-reduced-motion`. **(proposed)**
- **Feedback:** Success and errors after an action: toast. Field errors: red border plus a red message under the field that says what is wrong and how to fix it, checked when the field loses focus. Confirmations before destructive actions: confirm modal. Empty lists: a short sentence and the action that fills the list (e.g. "No receipts yet" plus **Snap receipt**). **(proposed)**
- **Mobile:** See "Spacing and layout" for breakpoints. Below 640px the tab bar replaces the side navigation and the **Snap** button sits raised in its center. **(proposed)**

## Values

*Lists the exact colors, type, sizes and shapes to use, so nothing is guessed.*

### Colors

| Role | Value | Variable / note |
|---|---|---|
| Page base | `#141615` | `--bg-page`. Charcoal with a slight green bias. |
| Body text | `#C9D1CC` | `--text-body` |
| Headings, emphasis | `#F1F5F2` | `--text-heading`. Also text on the accent (`--on-accent`). |
| Muted text | `#8A948E` | `--text-muted`. Dates, hints, labels, placeholders. |
| Border | `#2E3430` | `--border` |
| Border hover | `#3D4540` | `--border-hover`. Input hover. |
| Code / dropdown background | `#242926` | `--surface-raised` |
| Accent | `#276749` | `--accent`. Forest green. Main buttons, Snap button. `--on-accent` text on it is 6.1:1 (WCAG AA). |
| Accent hover | `#2C7A52` | `--accent-hover`. Text on it is 4.8:1 (WCAG AA). Any new accent value must keep `--on-accent` text at 4.5:1 or more. |
| Accent text / focus | `#68D391` | `--accent-text`. Green text, icons, selected tab, focus ring. |
| Accent tint / border | `rgba(39,103,73,0.24)` / `rgba(104,211,145,0.28)` | `--accent-tint` / `--accent-tint-border`. Highlighted chips. |
| Surface fill | `#1C201E` | `--surface`. Cards, panels, tables. |
| Background scrim | `rgba(8,10,9,0.55)` | `--scrim`. Behind modals. |
| Photo backdrop | `#2A2F2C` / text `#C9D1CC` | `--photo-backdrop` / `--on-photo-backdrop`. Behind receipt photos, in both themes, so paper looks the same in each. |
| Error | `#F87171` | `--danger`. Field errors, error toasts. |
| Success | `#68D391` | `--success`. Same value as `--accent-text`. |
| Warning | `#F6AD55` | `--warning`, tint `--warning-tint` `rgba(246,173,85,0.14)`, border `--warning-border` `rgba(246,173,85,0.3)`. "Review required", stale queue. |
| Danger (destructive actions) | `#F87171` | `--danger`, tint `--danger-tint` `rgba(248,113,113,0.14)`, border `--danger-border` `rgba(248,113,113,0.3)`. |
| Price went up | `#F87171` | Uses `--danger`. Always with an up arrow, never color alone. |
| Price went down | `#68D391` | Uses `--success`. Always with a down arrow. |

### Light theme colors

Same token names as the dark table above; only the values change. Every text pair below passes WCAG AA (4.5:1) on the surfaces it is used on.

| Token | Light value | Note |
|---|---|---|
| `--bg-page` | `#F3F5F3` | Pale green-gray |
| `--surface` | `#FFFFFF` | White cards |
| `--surface-raised` | `#EAEEEB` | |
| `--border` / `--border-hover` | `#DDE3DF` / `#C5CEC8` | |
| `--text-heading` | `#141615` | |
| `--text-body` | `#3A423D` | |
| `--text-muted` | `#535D57` | |
| `--accent` | `#276749` | Same as dark |
| `--accent-hover` | `#1F543B` | Darker on hover in light |
| `--accent-text` | `#276749` | Green text, focus ring, selected tab |
| `--accent-tint` / `--accent-tint-border` | `rgba(39,103,73,0.10)` / `rgba(39,103,73,0.25)` | |
| `--on-accent` | `#FFFFFF` | |
| `--success` | `#276749` | Also price went down |
| `--warning` | `#965300` | Full-saturation amber. Chip text 4.71:1 |
| `--warning-tint` / `--warning-border` | `rgba(150,83,0,0.16)` / `rgba(150,83,0,0.40)` | |
| `--danger` | `#CC1414` | Saturated red. Also price went up. Chip text about 4.65:1 |
| `--danger-tint` / `--danger-border` | `rgba(204,20,20,0.12)` / `rgba(204,20,20,0.40)` | |
| `--surface-glass` | `rgba(255,255,255,0.62)` | Same blur as dark |
| `--surface-glass-strong` | `rgba(255,255,255,0.45)` | Modals; reads as light gray (about `#DFE0E0`) over the scrim |
| Glass border / highlight | `rgba(20,22,21,0.08)` / `inset 0 1px 0 rgba(255,255,255,0.80)` | |
| `--scrim` | `rgba(20,22,21,0.25)` | |
| `--shadow` / `--shadow-glass` | `0 8px 24px rgba(20,22,21,0.08)` / `0 12px 40px rgba(20,22,21,0.14)` | |
| Snap glow | `0 10px 24px rgba(39,103,73,0.35)` | |

- The light red and amber chip fills are at their limit: any stronger fill drops chip text below 4.5:1.

### Type

| Use | Value |
|---|---|
| Font | Inter, self-hosted (the variable font from `@fontsource-variable/inter`, bundled into the app; never loaded from Google Fonts, so phones contact only SnapTrack). CSS name `"Inter Variable"`, fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. The Latin subsets are cached for offline use. |
| Base size | 15px, line height 1.55 |
| `h1` | 30px / 700, letter-spacing -0.02em, line height 1.2 (26px below 520px) |
| `h2` | 20px / 600, letter-spacing -0.01em |
| `h3` | 16px / 600 |
| Hero title | Big amounts (month total): 32px / 700, letter-spacing -0.02em, line height 1.1 |
| Body / buttons | 15px; buttons 600 |
| Inputs, selects, text areas | 16px, so iOS doesn't zoom the page in when one is tapped (decided 2026-11-16) |
| Small UI text, nav | 13px; tab bar labels 11px |
| Form labels | 13px / 500, `--text-body` |
| Section labels (eyebrows) | 12px / 600, uppercase, letter-spacing 0.06em, `--text-muted` |
| Numbers | `font-variant-numeric: tabular-nums` on every amount, price, count and date in a list or table |

### Shape and depth

| Thing | Value |
|---|---|
| Panels | 16px radius (`--radius-panel`): cards, panels, modals, receipt rows |
| Buttons | 12px radius (`--radius-control`), 44px tall |
| Inputs | 12px radius, 44px tall |
| Status messages | 12px radius (toasts) |
| Small chips / code | 8px radius (`--radius-small`) for small boxes and swatches; chips and pills are fully round (`--radius-pill: 999px`) |
| Phone tab bar | 22px radius |
| Standard shadow | `0 8px 24px rgba(0,0,0,0.35)` (`--shadow`); glass layers use `0 12px 40px rgba(0,0,0,0.45)` (`--shadow-glass`) |

### Surfaces

The kinds of surface, from lowest to highest. Use these names when talking about a surface.

| Name | Look | Values | Used by |
|---|---|---|---|
| Page | Flat charcoal | `--bg-page` | Page background, input fill |
| Surface | Solid, 1px border | `--surface`, `--border` | Cards, receipt rows, panels, tables |
| Raised | Solid, a step lighter | `--surface-raised` | Secondary buttons, icon buttons, store logo tiles, plain chips, dropdowns |
| Glass | Frosted, mostly see-through | Fill `rgba(30,35,32,0.62)`, `backdrop-filter: blur(16px) saturate(140%)`, border `rgba(255,255,255,0.08)`, top highlight `inset 0 1px 0 rgba(255,255,255,0.06)`, `--shadow-glass` | Top bar, tab bar, toasts, sheets |
| Strong glass | Frosted, more see-through, light blur so shapes behind stay visible but unreadable | Fill `rgba(30,35,32,0.45)`, `backdrop-filter: blur(5px) saturate(160%)`, same border, highlight and shadow as Glass | Modals and confirm modals |

- Glass needs content behind it to read as glass. Never put glass on a card in a list.
- Always include the `-webkit-backdrop-filter` prefix (Safari on iPhone). Where `backdrop-filter` is not supported, the panels show the fill without blur; that is acceptable.

### Spacing and layout

| Thing | Value |
|---|---|
| Page container | Max width 1080px, centered; side gutter at least 16px plus the safe-area inset **(proposed)** |
| Card grid | 10–12px gap between list rows and cards; 16px between form fields; 24px between major blocks **(proposed)** |
| Form field gap | 16px between fields; 6px between label and input |
| Panel padding | 20px (modals 24px; receipt rows 12px × 14px) |
| Mobile breakpoints | Below 640px: phone layout with tab bar. 640–1023px: tablet. 1024px and up: desktop, side-by-side review **(proposed)** |
| Touch targets | At least 44px tall on phone |

### Theme tokens

- Every color is used through a role-named CSS variable (`--bg-page`, `--surface`, `--text-body`, `--accent`, …), never a pasted hex value. This is what makes the light theme a swap of values.
- The tokens live in one theme file, `apps/web/src/app/theme.css`, and nowhere else. Global element defaults (body, headings) are in `apps/web/src/app/base.css`.
- **Components are styled with CSS Modules** (decided 2026-11-15): each component's styles are in a `<Component>.module.css` next to it, using the tokens through `var(--…)`. No new global classes; styles shared by several components belong to a shared component in `apps/web/src/shared/`, not a global class.
- Switching: the dark values are the default. Light values apply when the device prefers light and the person's choice is System, or when they choose Light. The choice is a Dark / Light / System segmented control in Settings and is remembered on the device. **(proposed:** where the control sits in Settings.**)**

## Components

*Names the shared classes or components to reach for first, and what each is for.*

Component names below are placeholders until the client exists. **(proposed)**

| Need | Use |
|---|---|
| Main or additive action (add, create, save) | Primary button |
| Low-emphasis action (Cancel, Back) | Secondary button (in modals) or ghost button (in toolbars) |
| Destructive action (delete, remove) | Danger button |
| Waiting for content | Loader (see "Loading") |
| Floating surface | Glass panel |
| Clickable card | Receipt row / card on `--surface`, border lightens on hover |
| Text field / area | Input: `--bg-page` fill, `--border`, 12px radius |
| Search | Input with a Lucide `search` icon inside on the left |
| Error / success message | Toast after an action; field message for input errors |
| Window over a page | Modal |
| Question before an action | Confirm modal |
| Notification after an action | Toast |
| Empty list | Empty state: one sentence plus the action that fills the list |
| Tabs | Phone: glass tab bar. Desktop: segmented control **(proposed)** |
| Side navigation (640px and up) | Solid, not glass: a column on the page background with a 1px `--border` on its right. From the top: the SnapTrack name (18px / 700), the profile button (52px, `--surface` fill, `--border`, 12px radius: a 32px round initial in `--accent-tint` with `--accent-text`, the display name, a chevron; opens a menu with the name and **Log out**), 28px of space, the sections (Receipts, Analytics, Budget, Library, Settings) as 44px-tall items (20px icon, 15px label, `--text-body`, 12px radius), then 28px of space and the main action, **Upload receipt**, with **Add expense** (secondary button) 8px below it. Hover: `--surface-raised` fill. Selected: `--surface-raised` fill with `--accent-text` icon and label. The main action is hidden on a screen that has its own, so each screen keeps one. No top bar at any width (decided 2026-11-15, receipts mock). |
| Phone tab bar | Receipts, Analytics, the raised **Snap** button, Library, Settings. Hidden on the receipt page, whose edit card holds its actions (decided 2026-11-15). |
| Status and categories | Pill: 26px tall, fully round, 13px / 500. Variants: plain, accent, warning, price up, price down |
| Receipt status in the receipts list | No pill and no word: a 16px Lucide icon in the status color beside the amount, with the status as its `aria-label`. Confirmed: `circle-check`, `--success`. Unreviewed: `circle-dashed`, `--warning`. Review required: `circle-alert`, `--warning`. Being read (uploaded, extracting): `clock`, `--text-muted`. Color and icon shape both carry the status, so it never depends on color alone (decided 2026-11-15; icons and colors **(proposed)**) |
| Icons | Lucide only, 2px stroke, 18px in buttons, 20px in the tab bar, 14px in pills |

### Action buttons

Four kinds of button; green marks the main action, red marks only destructive ones, and everything else is neutral.

| Kind | Look |
|---|---|
| Main or additive | `--accent` fill, `--on-accent` text, 600 weight, hover `--accent-hover`. One per screen or modal. |
| Low-emphasis (Cancel, Back) | Secondary: `--surface-raised` fill, `--border`, heading-color text. Ghost: no fill, body text, raised fill on hover. |
| Destructive, labeled button | `--danger-tint` fill, red border, `--danger` text, trash icon. Label names the thing ("Delete receipt"). |
| Destructive, menu item or tool action | `--danger` text, no fill **(proposed)** |
| Destructive, icon-only | Icon button (40px, 12px radius, raised fill); icon and border turn red on hover; needs an `aria-label` |

- Destructive means deleting or removing data (a receipt, a line item, a category). Archive is not destructive. Cancel and Close are never destructive.
- While its action runs, a button keeps its size, is disabled, and swaps its icon for a small spinner; the label stays. **(proposed)**
- The **Snap** button on phone: 60px green circle, raised out of the tab bar, camera icon, with a green glow shadow `0 10px 24px rgba(39,103,73,0.45)`.

### Loading

One loading component for every wait on content, in a page, a section or a modal. **(proposed)**

| Part | Value |
|---|---|
| Delay | Show nothing for the first 300ms |
| Indicator | Skeleton blocks in `--surface-raised` with a slow shimmer (off under reduced motion) |
| Text | None for short waits; after 5s, a muted line saying what is loading |
| Leaving | Fade out over 160ms as content arrives |
| Page placement | Fills the content area below the top bar |
| Section placement | Fills the section at the size of the content it stands for |

### Receipts screens

Approved 2026-11-15 in the receipts mock (https://claude.ai/code/artifact/63f6b028-6a8a-4a72-b1c6-7934841039cd, private to the developer).

| Part | Look |
|---|---|
| Receipts list row | Receipt row (Surface, 16px radius, 12px × 14px). Left: a 40px date block, month in 11px / 600 uppercase `--text-muted`, day in 20px / 700 heading color. Middle: the store name, 15px / 600 heading color, or "Unknown store" / "Reading receipt…" in `--text-muted`. Right: the amount (600, tabular) and the status icon (see "Receipt status"). No thumbnail, no status word. |
| Review filter | Chips above the list: All, Unreviewed · N, Review required · N. Pill shape, 32px tall; the selected one uses `--accent-tint` with `--accent-tint-border` and `--accent-text`. |
| Digital receipt | A confirmed row expands in place (the row is a button with `aria-expanded`). Below a 1px dashed `--border` rule: store and date line (13px muted), each line with its price (14px, tabular), another dashed rule, Subtotal / Tax (plus receipt discount and tip when present) / **Total** (700), "Paid with" the payment, and **View receipt image** (accent text link with an image icon, 44px tall) centered at the bottom. |
| Receipt page, phone (below 1024px) | Fills the screen exactly and never scrolls; only the edit card's body scrolls. No tab bar. A row with the back link (‹ Receipts) and the date and person (13px muted). Then the **photo card** (Surface, 16px radius, the photo inset 4px with a 12px radius, nothing else in it) over the **edit card** (Surface, 16px radius), both always visible (photo moved on top 2026-11-15). The edit card has two pages: **Store** ("1 of 2"; the store question; footer button **Continue to items**, disabled until a store is chosen) and **Items & totals** ("2 of 2"; the store and a **Change store** link under the heading; its body scrolls inside the card; footer button **Confirm**, full width). |
| Receipt page, desktop (1024px and up) | The form on the left, the photo pane on the right (400px), side by side. The form's header is the store (30px / 700) with how it was matched below it (13px muted) and a secondary **Change store** button. Lines are a table: printed name, quantity, unit price, amount, and a 40px "⋯" options button. Totals sit in a 280px column beside the collapsed sections, with **Confirm** under them. The photo pane's zoom buttons (zoom out, zoom in, **Fit**) are at its bottom, right-aligned. |
| Store choice | Each suggestion is a 56px button (`--surface-raised`, `--border`, 12px radius): store name 15px / 600, the reason in 13px muted below ("Its phone number … is saved for this store", "Similar name"). The chosen one uses `--accent-tint`, `--accent-tint-border` and a check icon. The name the receipt shows is offered last among the suggestions as **Create "<name>"** with no reason line below it, chosen from the start when nothing else is suggested. Below: "Another store", a search input that also offers **Create "<name>"**. |
| Consistency warning | Under the field it concerns: `--warning-tint` box with `--warning-border`, 12px radius, a 16px `triangle-alert` icon in `--warning`, 13px body text saying what doesn't add up. The field itself gets a `--warning` border. |
| Collapsed sections | Note, More details, Store details as printed, Transcription: 44px rows with a chevron, inside one bordered box; each opens in place. A manual entry has no Store details as printed or Transcription. |
| Duplicate warning | At the top of the receipt card's body: per other receipt, a `--warning-tint` box with `--warning-border`, 12px radius, 12px × 14px. A 16px `triangle-alert` in `--warning`; "This receipt is already here" (definite) or "This may be a duplicate" (possible), 14px / 600 heading color; one 13px line saying what matched and which receipt ("Same transaction number (TRN 004471) as the Fresh Mart receipt from Nov 13, $7.00, logged by Sam."); **Open that receipt** (13px / 600 accent link). Below: **Delete this receipt** (36px, `--danger-tint`, `--danger-border`, `--danger` text, trash icon) and **Not a duplicate** (36px ghost). A manual entry being typed shows the box without the buttons. Approved 2026-11-16 in the manual entry mock. |
| Delete receipt | At the bottom of the receipt card's body (phone) or under the form's actions (desktop), centered: `--danger` text, no fill, trash icon, 44px tall; opens a destructive confirm naming the store, date, photos and lines. |
| Receipts list: manual entries | "Manual" (12px, `--text-muted`) under the store name. On the phone, **Add expense** (secondary, 44px, plus icon) sits at the right of the "Receipts" heading; hidden from 640px, where the side navigation has it. |
| Merge | On a store's or item's Library page, a last card: "Same store as another?" (16px / 600), one 13px muted line, and a secondary **Merge into another store** (or item). In Library › Labels, **Merge into…** (secondary) in an entry's or tag's sheet. Each opens a modal (replacing the sheet, never over it) with a "Find the one to keep" field and the choices as 44px raised buttons (an entry's full path in 13px muted below its name), then a confirm naming both and what moves, ending "This can't be undone.", with **Merge stores** / **Merge items** / **Merge categories** / **Merge tags** as its main (not destructive) button. Afterwards the kept store's or item's page opens, with a toast. Built from the guide's parts, 2026-11-16 (no mock). |
| Add expense | Approved 2026-11-16 in the manual entry mock (https://claude.ai/code/artifact/d35047a6-b7c5-4fa2-a6a8-c837ebe0afde, private to the developer). Phone: the receipt page's layout without the photo card: back link row, then one edit card filling the screen (fixed; only its body scrolls; no tab bar). Its header: **Add expense** with a segmented control, **Quick** / **Items** (`--bg-page` track, 3px padding, 12px radius; 32px segments, 9px radius, the chosen one `--surface-raised` with heading color and 600). Quick: the store choice, Date and Total side by side, Category (the line category chip, "(optional)" in muted, opening the category picker), Note. Items: the store choice, then the review form's fields. Footer: **Save expense**, full width. Desktop: back link, `h1` with the segmented control at its right, then one Surface card (24px padding, 640px wide) with the same fields and **Cancel** / **Save expense** at its bottom right. |

### Categories and tags

Approved 2026-11-15 in the labels mock (https://claude.ai/code/artifact/c9a4413f-f79e-4e5a-a264-c1f75e59c82b, private to the developer). Colors for categories and tags wait for Stage 6; until then they use the plain pill.

| Part | Look |
|---|---|
| Line category chip | Under the line's row, a plain pill (28px tall, `--surface-raised`, `--border`, 13px / 500 heading color) with the category's path ("Groceries › Dairy") and where it comes from in muted 400 weight ("· this item", "· this purchase", "· store default"). A button: it opens the category picker. A line with no category shows **Category** in the same pill. |
| Line tags | Beside the chip, in the same wrapping row. An item's tag: plain pill. A tag on this purchase only: no fill, 1px dashed `--text-muted` border, labeled "<tag> · this purchase". |
| Category suggestion | On a line with no category: "Suggested: **Groceries › Bakery**" (13px muted, the path in body color), then **Accept** (accent pill: `--accent-tint`, `--accent-tint-border`, `--accent-text`, 600) and **Dismiss** (no fill, `--border`, body text), both 28px. |
| Store default question | At the top of the items card's body while the store has no default category: a box with `--accent-tint` and `--accent-tint-border`, 12px radius, 12px × 14px. "What do you usually buy at <store>?" (14px / 600 heading color), one 13px line saying what it does, then **Choose a category** (main button, 36px) and **Not now** (ghost, 36px). |
| Set all lines | Secondary pill button (32px, 13px / 500) at the right of the items card's heading row. Opens the picker; the choice becomes every line's this-purchase category. |
| Category picker | A modal (bottom sheet on phone). Heading **Category** with the item's name and current path below it (13px muted); for a store, **Default category** with the store's name. A row with a filter input (search icon) and a secondary **+ New category** button. Then the hierarchy as a tree in a bordered box (`--bg-page`, 12px radius) that scrolls inside the sheet: 40px rows indented 18px per level, a ▸ / ▾ chevron for entries with children, L1 in 600. The chosen row uses `--accent-tint`, `--accent-tint-border` and a check. An open category ends with a dashed-border row "+ Add a class under <name>". For an item only: an **Apply to** box (bordered, 12px radius) with radios **This item** ("Every purchase of <item>, at any store", chosen first) and **This purchase only**. Buttons: **Cancel**, then **Save category** (or **Set default** for a store). |
| Library › Labels | Back link (‹ Library), `h1` **Labels**. A **Categories and classes** card: heading row with a secondary **+ Category** pill; the tree as 44px rows indented 20px per level, with a chevron, the name (L1 in 600), its level (L1–L4, 12px muted) and a 36px "⋯" menu (Rename, Move, Add a class, Remove; Remove in `--danger` text). Archived entries show in `--text-muted` with "(archived)". A muted 13px note at the bottom says the set can be edited and used entries are archived rather than deleted. A **Tags** card: heading row with **+ Tag**, a one-line muted description, and the tags as 32px plain pills with their purchase count in muted 400. |

## Overlays

*Describes the kinds of layer that appear over a page, so each one looks and behaves the same everywhere.*

### Modals (windows)

For a window of content over a page: a form, a picker, a list, a sheet.

| Part | Value |
|---|---|
| Overlay | Fixed, full screen, centered on desktop; bottom sheet on phone **(proposed)** |
| Scrim | `--scrim` `rgba(8,10,9,0.55)` |
| Panel | Strong glass, 16px radius (bottom sheet: 16px top corners only) |
| Widths | Small 420px, medium 560px, large 720px; never wider than the screen minus 32px **(proposed)** |
| Page scroll | Locked while open |
| Close button | Icon button with Lucide `x`, top right, `aria-label="Close"` |
| Heading | `h3` (16px / 600), heading color |
| Fade in / out | 200ms fade **(proposed)** |
| Main button | Bottom right, after the secondary button |

- **Closing:** Close button, Escape, or a tap on the scrim. Turned off while a save is running. **(proposed)**
- **Stacking:** No modal opens over another, except a confirm modal over a modal. **(proposed)**
- **Focus:** Moves to the first field (or the heading) on open, is trapped inside, and returns to the control that opened it on close.
- **Long content:** The panel body scrolls; heading and buttons stay in place.

### Confirm modals

For a question before an action. Built on the modal above.

| Part | Value |
|---|---|
| Width | 420px (small) |
| Scrim | `--scrim` |
| Pane | Strong glass: fill `rgba(30,35,32,0.45)`, `blur(5px) saturate(160%)`, 8% white border, top highlight, `--shadow-glass` |
| Padding | 24px |
| Content | Heading, one short paragraph, buttons; 14px gap |
| Heading | A question naming the thing ("Delete this receipt?") |
| Body | What will happen, in specifics ("The Walmart receipt from Nov 12 and its 6 line items will be removed from every total.") |
| Buttons | Right-aligned: secondary **Cancel**, then the action button |
| Action button | [A specific label, never "OK"]: "Delete receipt", "Merge categories" |
| Destructive action | Danger button with trash icon |

- **Closing:** Cancel, Escape or a tap on the scrim all mean Cancel.
- **Focus:** A destructive confirm opens with focus on Cancel.
- **After confirming:** The modal closes and a toast reports the result ("Receipt deleted"). **(proposed)**
- **One at a time:** Only one confirm modal can be open.

### Toasts

For a short notification after an action: an error, or a success.

| Part | Value |
|---|---|
| Placement | Phone: top, just below the top bar, full width minus 14px each side. Desktop: bottom right **(proposed)** |
| Stacking | Newest on top, up to 3 **(proposed)** |
| Layer | Above modals |
| Fill and border | Glass |
| Shape | 12px radius |
| Width | Phone: full width minus gutters. Desktop: 360px **(proposed)** |
| Content | Icon, bold short result, optional detail ("**Receipt saved.** Costco, 14 items."), close button |
| Error | `--danger` icon (Lucide `circle-alert`); says what failed and what to do |
| Success | `--success` icon (Lucide `circle-check`) |
| Close | Small `x`, muted, 28px target |
| Timing | Success closes after 4s; errors stay until closed **(proposed)** |

- **The page stays usable:** A toast never blocks the page or takes focus.
- **Pause:** Hover or focus on a toast pauses its timer.
- **Accessibility:** Errors use `role="alert"`; successes use `role="status"`.

## Do and don't

*Quick rules that catch the most common drift.*

- Do use a variable when one exists; don't paste a value that matches it.
- Do use the shared button classes; don't build a new button style for a one-off.
- Don't use the browser's `alert()` or `confirm()`.
- Don't put glass on cards, rows or tables; glass is only for layers that float.
- Don't use green for anything that is not the main action, selection, focus, success or a price drop.
- Don't show price changes with color alone; always add an arrow.
- Do use tabular numbers for every amount in a list or table.
- Don't add a second icon library; Lucide only.
- Don't put warning (amber) text directly on glass; in light mode it falls below 4.5:1 there. Put it in a chip on a solid surface.
- Do check both themes when adding a color; a new text color must pass 4.5:1 in dark and light.

## Known inconsistencies

*Records places the code already breaks this guide, so they are fixed on purpose rather than copied.*

<!-- One bullet per mismatch: date, what differs, where (file and class or component). -->
- 2026-11-15: The loader (`apps/web/src/shared/ui/Loader.tsx`) disappears at once when content arrives instead of fading out over 160ms ("Loading", "Leaving"). Fix when page transitions are built.
