---
name: Sakura Healing
colors:
  surface: '#fff7fe'
  surface-dim: '#e1d7e4'
  surface-bright: '#fff7fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fbf0fe'
  surface-container: '#f5eaf8'
  surface-container-high: '#efe5f2'
  surface-container-highest: '#eadfec'
  on-surface: '#1f1a23'
  on-surface-variant: '#524348'
  inverse-surface: '#342e38'
  inverse-on-surface: '#f8edfb'
  outline: '#857278'
  outline-variant: '#d7c1c7'
  surface-tint: '#934466'
  primary: '#934466'
  on-primary: '#ffffff'
  primary-container: '#ff9ec4'
  on-primary-container: '#7b3052'
  inverse-primary: '#ffb0cd'
  secondary: '#755664'
  on-secondary: '#ffffff'
  secondary-container: '#fed5e6'
  on-secondary-container: '#795a68'
  tertiary: '#7e5537'
  on-tertiary: '#ffffff'
  tertiary-container: '#e5b08c'
  on-tertiary-container: '#684225'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9e4'
  primary-fixed-dim: '#ffb0cd'
  on-primary-fixed: '#3e0021'
  on-primary-fixed-variant: '#762c4e'
  secondary-fixed: '#ffd8e8'
  secondary-fixed-dim: '#e3bccc'
  on-secondary-fixed: '#2b1420'
  on-secondary-fixed-variant: '#5b3e4c'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#f1bb96'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#633e22'
  background: '#fff7fe'
  on-background: '#1f1a23'
  surface-variant: '#eadfec'
  background-creamy: '#FFF8FB'
  income-mint: '#A8E6CF'
  income-dark: '#3DBE8B'
  expense-rose: '#FF6F91'
  shadow-pink: rgba(255, 158, 196, 0.25)
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  data-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.1'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.3'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  margin-mobile: 20px
  gutter: 16px
  touch-target: 44px
  card-padding: 24px
---

## Brand & Style

The design system is centered around a "healing" (治愈系) philosophy, transforming the often stressful task of financial management into a gentle ritual of self-care. The brand personality is feminine, approachable, and soft, targeting users who appreciate a "Moe-style" aesthetic and emotional warmth in their digital tools.

The visual style is a blend of **Minimalism** and **Tactile/Soft-UI**. It utilizes heavy whitespace to reduce cognitive load, paired with large corner radii and "bubbly" proportions that make the interface feel friendly and non-threatening. The aesthetic is defined by "creamy" textures and soft-glow elevations that avoid the industrial coldness of traditional fintech apps.

## Colors

The palette is designed to evoke a "creamy" and "sweet" atmosphere. 

- **Primary (Sakura Pink):** Used for key actions, focus states, and brand highlights. It is the energetic heart of the UI.
- **Secondary (Peach Pink):** A softer tint for surfaces and background accents to maintain a monochromatic warmth.
- **Tertiary (Apricot):** Adds a playful contrast for secondary tags and decorative elements.
- **Semantic Colors:** The system uses a specific emotional mapping where **Mint Green** represents growth, income, and success, while **Rose Red** is used for expenditures and cautionary states.
- **Neutrals:** Pure black is strictly avoided. **Warm Gray** is used for all text to ensure the contrast remains gentle on the eyes. The background is a tinted **Creamy White**, providing a soft canvas that feels more organic than pure white.

## Typography

This design system uses **Plus Jakarta Sans** for its soft, rounded terminals and optimistic character, which perfectly complements the "Sakura" aesthetic. 

For numerical data (transaction amounts, balances), use the **Data** or **Display** styles with a heavier weight to ensure financial figures are the clear focal point. All text should be rendered in **Warm Gray** (`#5C5560`) to maintain the "healing" vibe. On mobile, headlines scale down slightly to prevent awkward text wrapping in cards. Letter spacing is slightly tightened on large displays to keep the "bubbly" look cohesive.

## Layout & Spacing

The layout follows a **fluid grid** model optimized for mobile-first interaction. It prioritizes "low density" to ensure the UI feels airy and breathable. 

- **Margins:** A generous 20px side margin is maintained on mobile to prevent content from feeling cramped against the screen edges.
- **Rhythm:** A 4px base unit governs all spacing. Vertical rhythm is relaxed, with large gaps between cards to emphasize individual "moments" of recording.
- **Touch Targets:** A strict minimum of 44px is enforced for all interactive elements, particularly in the category selection grid, to accommodate single-handed usage.
- **Reflow:** On tablet and desktop, cards should maintain a maximum width of 600px to preserve the intimate, mobile-app feel rather than stretching excessively.

## Elevation & Depth

Hierarchy is achieved through **Tonal Layering** and **Ambient Shadows**. Instead of traditional gray shadows, this system exclusively uses a **Pink Soft Glow** (`rgba(255,158,196,0.25)`).

- **Level 1 (Base):** The Creamy White background surface.
- **Level 2 (Cards):** Slightly elevated using a very soft, diffused pink shadow with a large blur radius (12-16px). This makes cards look like they are floating gently on a cloud.
- **Level 3 (Interactive/Modals):** Primary buttons and floating action buttons use a more pronounced glow to indicate they are the most important elements on the screen.
- **Flat Depth:** For secondary information, use the **Peach Pink** color as a flat fill instead of adding shadow, creating a "recessed" look rather than an elevated one.

## Shapes

The shape language is the defining characteristic of this system. It uses **Rounded (Value 2)** as the standard, but pushes further for specific brand-critical elements.

- **Standard Cards:** 16px corner radius to ensure they feel soft and "squishy."
- **Interactive Elements:** Buttons, tags, and inputs should use a **24px radius** or a full **Pill-shape** where height allows.
- **Form Inputs:** Highly rounded containers with a subtle 2px Sakura Pink border only appearing on focus.
- **Icons:** All category icons should be enclosed within a circle or a "super-ellipse" (squircle) to maintain the bubbly aesthetic.

## Components

- **Buttons:**
  - *Primary:* Sakura Pink fill, white text, 24px capsule shape, with a soft pink glow shadow.
  - *Secondary:* Apricot or Peach Pink fill with Warm Gray text, no shadow.
- **Cards:** White or very light pink base, 16px radius, containing high-contrast data. Used for transaction items and monthly summaries.
- **Input Fields:** Creamy background with no border in default state; 2px Sakura Pink border on focus. Large 16px internal padding.
- **Chips/Tags:** Used for categories (e.g., "Food", "Travel"). Small capsule shapes with Peach Pink backgrounds.
- **Progress Bars:** Thick, rounded tracks in Peach Pink with Sakura Pink or Mint Green fills to show budget progress or income goals.
- **Illustrations:** Every empty state (e.g., "No records yet") must feature a cute "Moe" character illustration (piggy banks, bears) in a pastel color palette to maintain the emotional "healing" connection.
- **Toasts & Feedback:** Use soft-shake animations for errors and "amount flying" micro-interactions for successful saves to add a sense of playfulness.