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

- **Primary (Sakura Pink `#FF9EC4`):** Key actions, focus states, brand highlights.
- **Secondary (Peach Pink `#FFD6E7`):** Softer tint for surfaces and background accents.
- **Tertiary (Apricot `#FFC8A2`):** Playful contrast for secondary tags and decoration.
- **Income (Mint Green `#3DBE8B`):** Growth, income, success states.
- **Expense (Rose Red `#FF6F91`):** Expenditures, cautionary states. Always paired with a "−" prefix.
- **Neutrals:** Pure black is avoided. **Warm Gray `#5C5560`** for all body text. Background is **Creamy White `#FFF8FB`**.

## Typography

Uses **Plus Jakarta Sans** for soft, rounded terminals that complement the sakura aesthetic.

| Style | Size | Weight | Use |
|---|---|---|---|
| display-lg | 32px | 700 | Page titles |
| headline-lg | 24px | 600 | Section headers |
| data-lg | 28px | 700 | Financial figures |
| body-lg | 16px | 500 | Card content |
| body-md | 14px | 400 | Secondary info |
| label-md | 12px | 600 | Tags, labels |

## Layout & Spacing

- **Base unit:** 4px grid
- **Side margins:** 20px on mobile
- **Touch targets:** 44px minimum (critical for category grid)
- **Card max-width:** 600px — preserves mobile intimacy on wider screens

## Elevation

Hierarchy via **Tonal Layering** + **Pink Soft Glow** (`rgba(255,158,196,0.25)`). No gray shadows.

| Level | Surface | Shadow |
|---|---|---|
| Base | `#FFF8FB` creamy background | none |
| Cards | white | soft pink glow, blur 12–16px |
| Modals / FAB | white | pronounced pink glow |
| Recessed info | `#FFD6E7` flat fill | none |

## Shape Language

- **Cards:** 16px radius
- **Buttons / Inputs:** 24px radius or full pill
- **Category icons:** Enclosed in circle or squircle (super-ellipse)

## Component Tokens

| Component | Spec |
|---|---|
| Primary button | Sakura Pink fill · white text · pill shape · pink glow shadow |
| Secondary button | Peach/apricot fill · warm gray text · no shadow |
| Input (default) | Creamy bg · no border · 16px padding |
| Input (focus) | 2px Sakura Pink border · `rgba(255,158,196,.15)` ring |
| Chips | Peach Pink bg · capsule · 12px label |
| Progress bars | Peach Pink track · Sakura Pink or Mint Green fill · rounded |
| Toast (success) | Mint Green · "amount flying" micro-interaction |
| Toast (error) | Rose Red text · soft-shake animation |
| Empty state | Cute illustration (piggy bank / bear) in pastel palette |
