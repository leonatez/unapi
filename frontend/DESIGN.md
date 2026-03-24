# Design System: unapi — API Contract Intelligence Platform

## 1. Visual Theme & Atmosphere

A dense, clinical tooling interface for fintech integration engineers and technical PMs. The atmosphere is a **well-lit operations center at 2 AM** — high information throughput, low cognitive noise. Every pixel earns its place. No decorative flourishes, no visual entertainment. The UI should feel like it was built by engineers who also read typography books.

- **Density:** 7/10 — cockpit-dense. Tight line spacing in tables, generous only in section headers and empty states
- **Variance:** 4/10 — functional asymmetry where it serves data hierarchy (split panels, left-aligned headers), not artistic chaos
- **Motion:** 3/10 — near-static. Motion reserved for state transitions (loading → result, collapse/expand). No ambient animation

The base canvas is an absolute void — `#030712`, deeper than standard Slate-950. Everything floats atop this void as surfaces, not as objects with decorative depth.

---

## 2. Color Palette & Roles

### Base Surfaces
- **Void Canvas** (`#030712`) — Primary page background. Near-black but not pure black. The ground everything rests on
- **Panel Surface** (`#111827`) — Gray-900. Cards, side panels, table backgrounds, dropdowns
- **Raised Surface** (`#1F2937`) — Gray-800. Inputs, code blocks, hover states on panel surface, editing rows
- **Deep Pit** (`rgba(17, 24, 39, 0.5)`) — Transparent Gray-900. Inset wells, example JSON blocks

### Structural Lines
- **Primary Border** (`rgba(55, 65, 81, 0.8)`) — Gray-700 at 80% opacity. Card outlines, table row dividers
- **Whisper Divide** (`rgba(31, 41, 55, 1)`) — Gray-800 solid. Sub-row separators within a panel
- **Focus Ring** (`#6366F1`) — Indigo-500. Active input border, active tab underline

### Text Scale
- **Primary Ink** (`#F9FAFB`) — Gray-50. Page titles, API names, field names in view mode, active tab labels
- **Secondary Ink** (`#9CA3AF`) — Gray-400. Descriptions, labels, inactive navigation, secondary metadata
- **Muted Ink** (`#6B7280`) — Gray-500. Table column headers, placeholder text, "No data" states, deprecated field text
- **Ghost Ink** (`#374151`) — Gray-700. Line-through deprecated items, strikethrough text

### Accent (Single)
- **Signal Indigo** (`#6366F1`) — Indigo-500. Primary CTA fill, active tab underline, focus ring, "+ Add" links, active nav pill background, logo mark. Maximum saturation: 79%. No outer glow

### Identity Colors (Semantic, not decorative)
- **Monee Iris** (`#818CF8`) — Indigo-400. Internal document owner badge, `api_name` in diff cards, "Monee exposes" badge background tint `rgba(67, 56, 202, 0.25)`
- **Bank Gold** (`#FCD34D`) — Amber-300. Partner document owner badge, "Bank exposes" badge background tint `rgba(120, 53, 15, 0.35)`

### Severity System (Diff Cards)
- **Breaking Crimson** (`#F87171`) — Red-400. Badge text, border accent. Background: `rgba(127, 29, 29, 0.3)`
- **Risky Amber** (`#FCD34D`) — Yellow-300. Badge text, border accent. Background: `rgba(120, 53, 15, 0.2)`
- **Info Steel** (`#9CA3AF`) — Gray-400. Badge text. Background: `rgba(17, 24, 39, 0.5)`. Border: Gray-800

### HTTP Method Badges (Monospace, Semantic)
- **GET Sage** (`#86EFAC`) on `rgba(20, 83, 45, 0.7)` — Green-300 on Green-950 tint
- **POST Azure** (`#93C5FD`) on `rgba(30, 58, 138, 0.7)` — Blue-300 on Blue-950 tint
- **PUT Wheat** (`#FDE68A`) on `rgba(120, 53, 15, 0.7)` — Yellow-200 on Amber-950 tint
- **DELETE Rose** (`#FCA5A5`) on `rgba(127, 29, 29, 0.7)` — Red-300 on Red-950 tint

### Diff Value Colors (In diff card side-by-side comparison)
- **Internal Value** (`#4ADE80`) — Green-400. Monee's value in a diff row
- **Partner Value** (`#60A5FA`) — Blue-400. Bank's value in a diff row
- **Missing Value** (`#374151`) — Gray-700. Dash "—" when value is absent on one side

### Data Type Colors (In field tables)
- **Type Label** (`#93C5FD`) — Blue-400. `data_type` column values (String, Number, Boolean…)
- **resultStatus** (`#A78BFA`) — Violet-400. Canonical status strings like `SENTOTP-SUCCESS`
- **resultCode** (`#FCD34D`) — Yellow-400. Numeric result codes like `2007`

### Confidence & State Signals
- **Low Confidence** (`#FB923C`) — Orange-400. The `?` indicator on uncertain LLM extractions
- **Required Field** (`#F87171`) — Red-400. "M" (mandatory) marker
- **Optional Field** (`#374151`) — Gray-700. "O" marker — should recede
- **Encrypted** (`#FCD34D`) — Yellow-400. Lock marker on encrypted fields

---

## 3. Typography Rules

- **Display / Page Titles:** `Geist Sans` — `text-2xl` (24px), `font-bold`, `tracking-tight`, Primary Ink (`#F9FAFB`). Reserved for page-level `<h1>` only
- **Section Headers:** `Geist Sans` — `text-xl` (20px), `font-bold`, Primary Ink. API name in the spec panel header
- **Body / Descriptions:** `Geist Sans` — `text-sm` (14px), Secondary Ink (`#9CA3AF`), `leading-relaxed`, max 65 characters per line
- **Table Content:** `Geist Sans` — `text-sm` (14px), Secondary Ink
- **Table Headers:** `Geist Sans` — `text-xs` (12px), `font-medium`, Muted Ink (`#6B7280`), `uppercase tracking-wide`
- **Metadata / Badges:** `Geist Sans` — `text-xs` (12px), specific semantic color per badge type
- **All Monospace Content:** `Geist Mono` strictly for: field names, API paths (`/api/v1/…`), resultStatus strings, resultCode values, HTTP status codes, `field_path` in diffs, JSON example blocks, code snippets, version strings, enum values. Size: `text-xs` (12px) in tables, `text-sm` (14px) in headers
- **Numbers in dense tables:** Always `Geist Mono` — max_length, HTTP codes, confidence scores

**Banned:**
- `Inter` — generic, overused, not appropriate for a precision tool
- `Times New Roman`, `Georgia`, `Garamond` — no serif anywhere in this interface
- Font weights below 400 in tables (illegible at small sizes on dark backgrounds)
- All-caps headers larger than `text-sm` (screaming)

---

## 4. Hero Section (Home Page)

The home page `unapi` hero is a **precision instrument introduction**, not a marketing landing page. It identifies the tool and routes the user to work.

- **Layout:** Centered is acceptable here (variance 4/10 — functional symmetry for a routing hub)
- **Headline:** `text-5xl sm:text-6xl`, `font-bold`, `tracking-tight`, Primary Ink. The word "unapi" is the entire brand — no decoration
- **Subheading:** One sentence, max 80 characters, Secondary Ink, `leading-relaxed`
- **Badge above headline:** Subtle pill — Signal Indigo tint (`rgba(99, 102, 241, 0.1)`) background, Indigo-400 text, Indigo border at 20% opacity. Contains a single icon + label. Not a status indicator — just a category tag
- **CTAs:** Maximum 3 navigation actions. Primary CTA (Upload) in Signal Indigo fill. Secondary CTAs (ghost, Gray-700 border). All `rounded-xl`, `text-sm`, `font-medium`
- **Feature Row:** NEVER 3 equal cards in a horizontal grid — they currently exist (Parse/Normalize/Diff). Replace with a **2-column asymmetric layout** on desktop or a **left-aligned vertical list** with border-left accent on desktop, collapsing to single column on mobile. Cards should use colored `border-top` (4px, matching the feature's semantic color) instead of equal border-all treatment
- **Banned on hero:** Scroll arrows, "Get started", bouncing chevrons, "Explore now", generic stock phrases

---

## 5. Component Stylings

### Navigation Bar
- Sticky, `z-50`, `backdrop-blur-sm`. Background: `rgba(3, 7, 18, 0.9)` — Void Canvas at 90% opacity, not Gray-950
- Height: 56px (`h-14`). Border-bottom: 1px Primary Border
- Logo: Small square (28px), Signal Indigo fill, `rounded-lg`, white icon centered. Brand name in `font-bold tracking-tight`, Primary Ink
- Active nav item: `bg-indigo-950` pill (NOT a full-width underline — pill communicates "location"). Text: Monee Iris (`#818CF8`)
- Hover state: `hover:bg-gray-800`, `hover:text-white`. Transition: `150ms`
- Mobile: Collapses to hamburger. Mobile menu drops below the nav, not as an overlay

### Buttons
- **Primary (Filled):** Signal Indigo (`#6366F1`) fill. `hover:bg-indigo-500`. `active:translate-y-px` — 1px tactile press. `text-white`, `font-medium`, `text-sm`. `rounded-xl`. NO outer glow, NO box-shadow with color spread
- **Secondary (Ghost):** Gray-700 border, Gray-400 text. `hover:border-gray-500 hover:text-white hover:bg-gray-800`. Same sizing and `active:translate-y-px`
- **Danger:** Red-900 background, Red-300 text. Only for destructive inline actions (delete field, delete error)
- **Small Inline (Save/Cancel):** `px-2 py-0.5`, `text-xs`, `rounded`. Save: Indigo-700 fill. Cancel: Gray-700 fill. Both `hover` one shade lighter
- **Disabled:** `opacity-40`. NO custom cursor changes
- **Loading state in button:** Text changes to "…" — no spinner icon inside the button

### Cards (Use Sparingly)
- Elevation communicates hierarchy — only use when grouping semantically distinct content
- `rounded-xl` (12px), 1px Primary Border. Background: Panel Surface (`#111827`)
- No colored outer glow. Shadow if needed: `shadow-sm` with black base `rgba(0,0,0,0.5)`
- In the feature cards on home: use `border-t-4` in the feature's semantic color instead of all-border tint treatment
- For high-density data (field tables, diff lists): **replace cards with `border-b` row dividers** — no card elevation in tables

### Diff Cards (Special)
- `rounded-lg`, 1px left border in severity color (4px `border-l`), background tint per severity
- Severity badge: `px-2 py-0.5`, `rounded`, `text-xs`, `font-medium`, `shrink-0`
- Field path in `Geist Mono`, `text-xs`, Gray-300
- API name in Monee Iris (`#818CF8`), `text-xs`, `font-medium`
- Side-by-side values: "Internal:" label in Gray-500, value in Green-400. "Partner:" label in Gray-500, value in Blue-400. Both in `Geist Mono`
- Notes/description: `text-xs`, Gray-500, below the value row

### Tables (Primary Content Pattern)
- `border-collapse`, `w-full`
- Header row: `text-xs`, Muted Ink, `font-medium`, 1px `border-b` Primary Border. `pb-2` spacing
- Data rows: `border-b border-gray-900`. `hover:bg-gray-900/50` — subtle reveal on hover
- Action buttons (edit/delete): `hidden group-hover:inline-flex` — only appear on row hover. Ghost icons, not labeled buttons
- Nested field rows: `paddingLeft` calculated from depth (`depth * 16 + 4px`). No expand/collapse icons unless subtree > 5 items
- Inline edit mode: Row expands, `bg-gray-900`, `border-b border-indigo-900`. Uses a 2-column grid for the form fields

### Inputs & Forms
- Background: Raised Surface (`#1F2937`). Border: Gray-600. `rounded`, `px-2 py-1`, `text-sm text-white`
- Focus state: `border-indigo-500`. No focus box-shadow spread — just the border color change
- Label: Above input, `text-xs`, Muted Ink (`#6B7280`), `block mb-1`
- Error text: Below input, `text-xs`, Red-400
- Select elements: Same treatment as inputs. Default `<select>` styling with background color override
- Checkbox: `accent-indigo-500` for standard checkboxes. `accent-red-500` for "Required" flag. `accent-yellow-500` for "Encrypted" flag
- Textarea: `resize-none`, same border treatment as inputs

### Tabs (within panels)
- Underline-style tabs: `border-b border-gray-800` container
- Tab button: `px-4 py-2`, `text-sm font-medium`, `border-b-2 -mb-px`
- Active: `border-indigo-500 text-white`
- Inactive: `border-transparent text-gray-500 hover:text-gray-300`
- Count badges on tabs: `text-xs bg-gray-700 px-1.5 rounded ml-1.5`

### Status Badges & Pills
- All badges: `px-2 py-0.5`, `rounded`, `text-xs`, `font-medium`
- HTTP method badges: additionally `font-mono font-bold` for visual distinction from prose
- Owner badges: Monee Iris on Indigo-950 tint; Bank Gold on Amber-950 tint
- Confidence warning ("low confidence"): Orange-300 text on Orange-950 tint
- Deprecated flag (`[dep]`): `text-xs text-gray-600` — designed to visually recede

### Loading States
- Table/list loading: Full-width skeletal shimmer rows at the table's exact dimensions. No spinner
- Button loading: Text changes only ("Comparing…", "…"). No spinner icon
- NO `<Spinner />` components anywhere. NO circular loaders

### Empty States
- Short, honest statement in Muted Ink (`text-gray-500 text-xs` or `text-gray-600`)
- Include a direct action link in Signal Indigo if applicable ("Use + Add field to add manually")
- No illustrations, no large centered icons, no motivational copy

### Error States
- Inline below the triggering form, `text-red-400 text-xs`
- Never toast/floating notifications for synchronous validation errors

### Security Profile Block
- `p-3 rounded bg-gray-800`, `text-xs text-gray-400`
- Inline dot-separated values. Label ("Security:") in Gray-300, values in Gray-400

---

## 6. Layout Principles

- **Max-width containment:** All page content constrained to `max-w-6xl` (1152px) or `max-w-4xl` (896px) for single-focus panels. Always `mx-auto px-6`
- **CSS Grid over Flexbox math:** Never use `calc()` percentage hacks for responsive columns. Use `grid-cols-2`, `grid-cols-3` with explicit `gap`
- **No overlapping elements:** Every element occupies its own clear spatial zone. No `absolute`-positioned content stacking over live content
- **Panels with fixed sidebar:** Use CSS Grid with defined column tracks (`grid-cols-[280px_1fr]` or similar), not `flex` with `w-1/4`
- **Full-height layouts:** Use `min-h-[100dvh]` — never `h-screen` (iOS Safari critical failure)
- **Internal padding:** Panels use `p-6`. Table cells use `py-2 pr-3`. Compact forms use `px-3 py-2`
- **Vertical spacing between page sections:** `mb-8` between the header block and first content section. `space-y-2` for diff lists (tight coherence)

---

## 7. Responsive Rules

- **Single-column collapse below 768px:** All multi-column layouts collapse. The compare page's two selector columns stack to single column. Side-by-side panels go full-width stacked
- **Navigation:** Desktop horizontal collapses to hamburger menu below `md:` breakpoint. Mobile menu appears below nav bar (not overlay)
- **Typography scaling:** Page titles use `text-2xl sm:text-3xl`. Hero headline uses `text-5xl sm:text-6xl`. Body: `text-sm` minimum (14px) — never below `0.875rem`
- **Touch targets:** All interactive elements minimum 44px tap target. Inline table action buttons (`✎`, `✕`) must expand their hit area on mobile
- **Horizontal overflow:** Zero tolerance. All tables use `overflow-x-auto` wrapper on mobile
- **Select inputs on mobile:** Native `<select>` is acceptable and preferred over custom dropdowns for form selectors
- **Table density on mobile:** Consider switching the field table to an accordion/card list below 640px if row count > 10

---

## 8. Motion & Interaction

This is a cognitive-load-heavy tool. Motion must be **subordinate to function**.

- **Transitions:** 150ms ease for color/background hover states. 200ms ease for border color changes. No transform animations on hover (except the hero feature cards' `hover:scale-[1.02]` — remove even this in future iterations)
- **No perpetual micro-animations:** No pulsing, no floating, no shimmer on static content. Shimmer only during active loading states
- **Loading shimmer:** Background animated gradient from Gray-800 to Gray-700 to Gray-800. Matches exact layout of expected content
- **State transitions:** When comparison result loads, fade-in the result block at 300ms, opacity 0→1. No slide animation
- **Accordion/collapse:** 200ms ease height transition for expand/collapse panels
- **Hardware-accelerated only:** `transform` and `opacity` exclusively. NEVER animate `height`, `width`, `top`, `left`, `max-height` without `overflow: hidden` containment
- **Spring physics:** Not applicable in this tool — use standard CSS `ease` transitions. Spring physics are for marketing/creative interfaces, not data tools

---

## 9. Anti-Patterns (Banned)

### Typography
- `Inter` font family — use `Geist Sans` exclusively
- Any generic serif (`Times New Roman`, `Georgia`, `Garamond`)
- All-caps section headers larger than `text-sm`

### Color
- Pure black (`#000000`) — use Void Canvas (`#030712`)
- Neon outer glows (e.g., `shadow-indigo-500/50` with large spread) — no box-shadow color halos on buttons or cards
- Oversaturated accent colors (saturation > 80%)
- Mixing warm and cool grays — use exclusively cool Gray (Tailwind's `gray-*` scale, not `stone-*` or `zinc-*`)
- The "AI purple/blue neon" aesthetic — resultStatus uses Violet-400 (`#A78BFA`) strictly for semantic data distinction, not decoration

### Layout
- 3 equal horizontal cards — the home page feature row currently uses this pattern. Must be replaced
- Centered hero sections on pages other than the home routing hub
- Overlapping absolute-positioned elements
- `h-screen` — use `min-h-[100dvh]`
- `calc()` percentage hacks for columns — use CSS Grid

### Components
- Circular spinner loaders — skeletal shimmer only
- Floating toast notifications for synchronous errors — use inline error text
- Custom mouse cursor styles
- Emoji in UI text — badge icons like `🚨⚠️ℹ️` currently in code should be replaced with Lucide icons (`AlertTriangle`, `Info`, `Shield`) in future iterations. The `🔒` encrypted indicator should become a Lucide `Lock` icon

### Copy
- "Seamless", "Unleash", "Next-Gen", "Elevate", "Streamline" — these are not in the current codebase. Keep it that way
- Fake round numbers (`99.99%`, `50K+`)
- Generic placeholder names in examples ("John Doe", "Acme Corp")
- "Scroll to explore", scroll arrows, bouncing chevrons anywhere

### Images
- Broken external image URLs — use `picsum.photos` or inline SVG for any placeholder imagery needed
- Decorative background images or textures on the void canvas

---

## 10. Semantic Color Reference Card

For Stitch screen generation, apply these semantic mappings consistently:

| Element | Color | Hex |
|---|---|---|
| Page background | Void Canvas | `#030712` |
| Card / panel background | Panel Surface | `#111827` |
| Input / code background | Raised Surface | `#1F2937` |
| Primary text | Primary Ink | `#F9FAFB` |
| Secondary text | Secondary Ink | `#9CA3AF` |
| Table column headers | Muted Ink | `#6B7280` |
| Primary CTA fill | Signal Indigo | `#6366F1` |
| Internal (Monee) identity | Monee Iris | `#818CF8` |
| Partner (Bank) identity | Bank Gold | `#FCD34D` |
| Breaking severity | Breaking Crimson | `#F87171` |
| Risky severity | Risky Amber | `#FCD34D` |
| Info severity | Info Steel | `#9CA3AF` |
| Internal value in diff | Internal Value | `#4ADE80` |
| Partner value in diff | Partner Value | `#60A5FA` |
| Field data type label | Type Label | `#93C5FD` |
| resultStatus string | Result Status | `#A78BFA` |
| resultCode value | Result Code | `#FCD34D` |
| GET method | GET Sage | `#86EFAC` |
| POST method | POST Azure | `#93C5FD` |
| PUT method | PUT Wheat | `#FDE68A` |
| DELETE method | DELETE Rose | `#FCA5A5` |
| Low confidence marker | Low Confidence | `#FB923C` |
| Required field marker | Required | `#F87171` |
| Primary border | Primary Border | `rgba(55,65,81,0.8)` |
| Focus / active accent | Signal Indigo | `#6366F1` |
