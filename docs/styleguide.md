# DualMode UI Style Guide (RedDoor Look)
**Status: Binding Visual Specification (Updated)**

This document defines the visual, layout, and interaction rules for the DualMode frontend.

If UI implementation contradicts this document, the design is incorrect.

This style guide replaces the prior Montserrat/flat-black spec by request.

---

## 1. Visual Identity

- Dark, neon, high-contrast.
- Background may use layered gradients and subtle patterning.
- “Red Door” motif: red-forward accents, glossy dark surfaces, blurred glass cards.

---

## 2. Typography (Binding)

Font families:
- Display: `Monoton` (app name, major titles)
- UI/Body: `Rajdhani` (buttons, labels, body text)
- Mono: system monospace stack for IDs, technical metadata

Weights:
- Rajdhani 400 / 600
- Monoton 400

Text rules:
- Titles: uppercase with letter-spacing.
- Labels/buttons: uppercase with letter-spacing.
- Body text: sentence case.

---

## 3. Color System (Binding)

Use CSS variables as the source of truth. The app’s theme must be driven by:
- `--bg0`, `--bg1`
- `--ink`, `--muted`, `--faint`, `--line`
- `--accent`, `--accent-hot`, `--accent-deep`
- `--accent2` (secondary accent)
- `--online`, `--warn`, `--danger`

Rules:
- Keep contrast readable for text and controls.
- Error messaging uses `--danger`.
- Presence/online indicators use `--online` (do not reuse accent red).

---

## 4. Layout & Components (Binding)

The UI is composed of:
- Shell: `.rd-shell`
- Sticky top bar: `.rd-topbar`, `.rd-topbar-inner`
- Main content container: `.rd-main`
- Cards: `.rd-card`, `.rd-card-head`, `.rd-card-body`
- Tabs: `.rd-tabs`, `.rd-tab`
- Form fields: `.rd-field`, `.rd-label`, `.rd-input`
- Buttons: `.rd-btn` with variants `.primary`, `.danger`
- Status chips: `.rd-chip` with `.rd-dot` indicators

Cards:
- Rounded corners (large radius).
- “Glass” look via gradients and blur.
- Borders are subtle and red-leaning (not thick solid red blocks).

---

## 5. Accessibility (Binding)

- All inputs must have labels (`aria-label` acceptable where visible label exists).
- Errors must be visible, in-text, and not color-only.
- Interactive elements must be keyboard accessible.

---

## 6. Prohibited

- Light theme defaults.
- Flat, pure-black-only surfaces everywhere (cards must have depth).
- Muting or hiding backend rejection messages.

