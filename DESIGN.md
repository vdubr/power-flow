# Design System

This project uses a dark-first "solar observatory / control desk" visual system. Interfaces should feel like a planetarium control panel mixed with a blueprint desk: dramatic, tactical, precise, and highly usable. The blueprint grid represents the sky chart / azimuth-elevation map; amber represents direct solar energy; teal represents converted and stored power; violet represents night depth.

---

## Stack

- **Framework:** Vite + React 19 + TypeScript
- **UI library:** MUI v7 (`@mui/material`) with Emotion
- **Icons:** `@mui/icons-material`
- **Charts:** ECharts via `echarts-for-react`
- **State:** Zustand
- **Styling:** MUI `ThemeProvider` + global CSS custom properties + utility classes in `src/index.css`
- **Fonts:** IBM Plex Sans (body), Fraunces (display), IBM Plex Mono (technical) — loaded via `@fontsource/*`
- **Testing:** Vitest + Testing Library
- **Theme entrypoint:** `src/theme/index.ts`
- **ECharts theme:** `src/theme/echartsTheme.ts`

---

## Visual Direction

The app is a live solar observatory, not a generic SaaS dashboard.

- Use dark canvas backgrounds, warm paper overlays, amber solar accents, teal power-flow highlights, and occasional violet night depth.
- Use glassy panels over a visible blueprint sky-grid texture.
- Prefer large editorial display headings (Fraunces) with tight tracking.
- Make controls feel tactile: rounded pills, inner shadows, subtle lift on hover, and visible focus rings.
- Avoid generic purple/white gradients, flat gray panels, and default Material defaults.

---

## Tokens

All semantic tokens live as CSS custom properties on `:root` (light) and `:root[data-theme="dark"]` (dark) in `src/index.css`, and are bridged into MUI through `createTheme` in `src/theme/index.ts` (palette entries use `var(--color-*)`).

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--color-background` | `oklch(0.94 0.032 86)` | `oklch(0.15 0.038 252)` | Page canvas |
| `--color-foreground` | `oklch(0.19 0.029 252)` | `oklch(0.94 0.034 88)` | Primary text |
| `--color-card` | `oklch(0.985 0.026 92 / 84%)` | `oklch(0.205 0.044 252 / 78%)` | Glass/paper panels |
| `--color-primary` | `oklch(0.68 0.165 55)` | `oklch(0.78 0.16 61)` | Amber solar actions |
| `--color-accent` | `oklch(0.78 0.122 174)` | `oklch(0.77 0.134 178)` | Teal power highlights |
| `--color-secondary` | `oklch(0.86 0.055 184 / 80%)` | `oklch(0.25 0.06 244 / 74%)` | Secondary surfaces |
| `--color-muted` | `oklch(0.88 0.03 84 / 68%)` | `oklch(0.26 0.052 252 / 64%)` | Subtle surfaces |
| `--color-muted-foreground` | `oklch(0.42 0.036 252)` | `oklch(0.73 0.042 88)` | Supporting copy |
| `--color-border` | `oklch(0.24 0.035 252 / 18%)` | `oklch(0.98 0.02 88 / 14%)` | Panel and input borders |
| `--color-ring` | `oklch(0.76 0.14 174)` | `oklch(0.8 0.15 178)` | Focus rings |
| `--color-destructive` | `oklch(0.58 0.21 31)` | `oklch(0.68 0.21 31)` | Delete/error actions |

Chart colors: `--chart-1` amber, `--chart-2` teal, `--chart-3` violet, `--chart-4` coral, `--chart-5` green. They are consumed by ECharts via `src/theme/echartsTheme.ts`.

Default theme mode is **dark**. Toggling between light and dark is done by setting `data-theme="light"` or `data-theme="dark"` on the `<html>` element (or by switching MUI `mode`).

---

## Typography

| Token | Font | Usage |
| --- | --- | --- |
| `--font-body` | IBM Plex Sans | Body text, controls, forms |
| `--font-display` | Fraunces | Hero headings, card titles, empty states |
| `--font-mono` | IBM Plex Mono | Model/device labels, code, technical metadata |

Guidelines:

- Hero headings use `font-display`, tight tracking, and large scale (use MUI `Typography variant="h1"`/`"h2"` mapped to Fraunces).
- Card titles use Fraunces, ~1.25rem, bold, tight tracking.
- Technical eyebrows use `.micro-label`: mono, uppercase, wide tracking.
- Body copy should stay readable with comfortable line-height (~1.55–1.7).
- Fonts are loaded via `@fontsource/ibm-plex-sans`, `@fontsource/fraunces`, and `@fontsource/ibm-plex-mono` (imported in `src/main.tsx`).

---

## Core Utilities

Defined as global CSS classes in `src/index.css`. They can be applied to any MUI component via `className`:

- `.observatory-bg`: layered blueprint grid + amber sun orb + teal power orb + violet night depth glow (use as page-level background).
- `.glass-panel`: high-impact translucent hero/header panel with inner highlight.
- `.paper-card`: default card treatment with translucent surface and deep shadow (apply to `<Card className="paper-card">`).
- `.blueprint-surface`: compact grid surface for charts and empty states (wrap ECharts container).
- `.command-strip`: amber-to-teal-to-violet gradient strip for primary action moments.
- `.micro-label`: technical uppercase label style (mono, uppercase, wide tracking).
- `.fade-up` / `.scale-in`: entrance animations (keyframes in `src/index.css`).

---

## Components

Components are MUI primitives with global overrides defined in `src/theme/index.ts` under `theme.components.*`.

### Cards

Use MUI `Card`/`Paper` with `className="paper-card"`. Override the default Material flat look with a translucent surface, rounded corners, and inner shadow.

```tsx
<Card className="paper-card">…</Card>
```

Avoid plain dark-gray cards. Nested item cards: add `backdrop-filter: blur(8px)`, translucent background, and inner shadow.

### Buttons

Primary buttons (`variant="contained"`) render with a `.command-strip` background, pill radius, bold type, and hover lift. Outline buttons (`variant="outlined"`) are translucent and reveal amber/teal on hover. All overrides live in `theme.components.MuiButton.styleOverrides`.

### Inputs

`TextField` / `OutlinedInput` use rounded-xl shape, translucent backgrounds, inner shadows, and a strong teal focus ring (`--color-ring`). Overrides live in `theme.components.MuiOutlinedInput`.

### Badges / Chips

Use MUI `Chip` styled as a mono, uppercase, wide-tracked pill. Useful for system state, data source, and device metadata.

### Charts

Wrap ECharts containers in an element with `className="blueprint-surface"`. Use `echartsTheme` registered via `echarts.registerTheme('observatory', observatoryTheme)` and apply it with `theme="observatory"` on `ReactECharts`.

---

## Layout

Use a wide observatory workspace. Page-level shell:

```tsx
<Box className="observatory-bg" sx={{ minHeight: '100vh' }}>
  <Container maxWidth="xl" sx={{ py: { xs: 4, lg: 6 } }}>
    {…}
  </Container>
</Box>
```

The main planner grid uses a sticky left command/chart rail and a wider right editing workspace:

```tsx
<Box sx={{
  display: 'grid',
  gap: 3,
  gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,0.85fr) minmax(0,1.35fr)' },
}}>…</Box>
```

Mobile remains single-column with no sticky behavior.

---

## Interaction

- Hover lift: `sx={{ transition: 'transform .2s ease', '&:hover': { transform: 'translateY(-2px)' } }}`
- Focus: visible 3px ring using `--color-ring` (override in `theme.components.MuiButtonBase`).
- Disabled: rely on MUI defaults plus reduced opacity.
- Page entrance: `className="fade-up"` and `className="scale-in"` (CSS keyframes in `src/index.css`).
- Keep motion subtle and purposeful.

---

## Accessibility

- Preserve visible focus rings on all interactive controls (do not disable MUI defaults).
- Keep text contrast high on translucent panels — test against `--color-foreground` over `--color-card`.
- Provide text/table representations alongside ECharts visualisations for screen readers.
- Controls must remain usable on mobile, especially add/remove/edit actions.
