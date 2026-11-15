# SnapTrack UI Design Guide

*Read this before adding or changing any UI or CSS.* Values will come from one shared theme file in `apps/web` (the styling tool is not chosen yet; see "Theme tokens"). That file is the source of truth once it exists. Items marked **(proposed)** are decisions not yet confirmed by the developer.

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
| Font | Inter (Google Fonts or self-hosted), fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| Base size | 15px, line height 1.55 |
| `h1` | 30px / 700, letter-spacing -0.02em, line height 1.2 (26px below 520px) |
| `h2` | 20px / 600, letter-spacing -0.01em |
| `h3` | 16px / 600 |
| Hero title | Big amounts (month total): 32px / 700, letter-spacing -0.02em, line height 1.1 |
| Body / inputs / buttons | 15px; buttons 600 |
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
- The tokens live in one theme file in `apps/web`. Whether components use CSS Modules, Tailwind or something else is decided when the client is set up; the token names above stay the same either way.
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
| Status and categories | Pill: 26px tall, fully round, 13px / 500. Variants: plain, accent, warning, price up, price down |
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
- None yet (no client code exists as of 2026-11-14).
