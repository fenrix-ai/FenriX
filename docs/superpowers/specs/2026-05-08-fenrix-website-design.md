# FenriX Marketing Website — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review
**Author:** Claude (with Dylan Massaro)

---

## 1. Goal

Build a single-page marketing website for **FenriX**, a student-run AI studio at Chapman University. The site sells two things at once:

1. **Credibility** to schools, sponsors, and partners (the people who fund or adopt our work).
2. **Showcase** of our projects, with Bakery Bash as the flagship and three other in-progress games filling out the portfolio.

A visitor in 30 seconds should know: (1) FenriX is a serious AI studio, (2) we build gamified classroom simulations, (3) how to engage with us.

## 2. Audience & Tone

- **Primary:** schools, sponsors, partners — corporate, mission-driven, credibility-heavy.
- **Secondary:** portfolio viewers — work-forward, studio-vibe.
- **Tone:** confident, "we ship," student energy without student amateurism. Mythic angle ("Fenrir + AI") used sparingly, not corny.

## 3. Visual Direction

**Modern Tech Studio (A) with a touch of Bold Agency (C).** Dark base with sharper, larger typography and a coral accent for color pops alongside the cyan from the FenriX logo.

### Palette

| Role            | Hex       | Notes                                                    |
|-----------------|-----------|----------------------------------------------------------|
| Background      | `#0b0d10` | Near-black with subtle warmth                            |
| Surface         | `#14181d` | Card backgrounds, panels                                 |
| Surface raised  | `#1c2128` | Hovered cards, modals                                    |
| Border          | rgba(255,255,255,.08) | Hairlines                                    |
| Text primary    | `#e7ecf2` | Headings, key body                                       |
| Text secondary  | `#8b95a3` | Subdued copy, captions                                   |
| Accent cyan     | `#0099ff` | Primary accent (matches logo eye)                        |
| Accent cyan soft| `#66ccff` | Hover, pills                                             |
| Accent coral    | `#ff6b4a` | Used sparingly for CTAs, "live" indicators, status pops  |
| Success         | `#00d18a` | "Live" status                                            |

### Typography

- **Display / headings:** Space Grotesk, 700–800, tight letter-spacing (-0.02em). Falls back to Inter.
- **Body / UI:** Inter, 400–500.
- **Mono:** JetBrains Mono — used in status pills, version numbers, code accents.

### Motion

- Subtle. Hover lift (translateY -2px) on cards. Scroll-into-view fade for sections. No scroll-jacking, no heavy parallax.
- Cyan-glow pulse on the FenriX logo "eye" in the hero (slow, 4s loop).

### Logo Treatment

- The geometric wolf SVG from the prompt, rescaled, with the existing cyan eye preserved.
- Wordmark "FenriX" with the X as the cyan accent (matching the logo's blue eye).

## 4. Site Architecture

```
/                         single long-scroll homepage
  #work                   anchor: project showcase
  #about                  anchor: mission + team
  #contact                anchor: contact form

/demo/bakery-bash         non-functional Bakery Bash demo
```

Sticky top nav: **FenriX logo** (left) · **Work / About / Team / Contact** (center) · **"Get in touch"** CTA (right).

## 5. Sections

### 5.1 Hero

- Large FenriX wolf SVG (animated cyan eye)
- "Live" pill: `● NOW PLAYTESTING — BAKERY BASH`
- Headline: **"We're gamifying the classroom."**
- Sub: "FenriX is a student-run AI studio at Chapman University, building competitive analytics games that teach by playing them."
- Two CTAs: `See our work` (scrolls to #work) · `Get in touch` (ghost button, scrolls to #contact)
- Background: subtle radial cyan glow upper-right, 8% opacity geometric grid overlay

### 5.2 Mission

- Short 2-paragraph statement covering: the etymology (Fenrir, the Norse wolf, + AI), what we make, why "playing it" beats "reading about it."
- 3 stat cards (large numerals): **4** active projects · **8** contributors · **1** university
- Quote attribution: *"Do the Hard Things." — Prof. Tim Frenzel*

### 5.3 Work

- Heading: "Selected work."
- Sub: "Four projects in flight. One classroom at a time."
- Grid: Bakery Bash featured (2-col span on desktop) + three project cards.
- Each card has:
  - Status pill: `● LIVE` (coral/green) / `IN DEVELOPMENT` / `CONCEPT`
  - Domain tag (mono, small): Strategy · Sports Analytics · Adaptive Learning · Rhetoric
  - Project name (display font)
  - One-line tagline
  - Hover: lift + cyan border accent
- Bakery Bash card has an extra `View demo →` link to `/demo/bakery-bash`

#### Project roster

| Slug          | Name             | Status         | Domain             | Tagline                                                                |
|---------------|------------------|----------------|---------------------|------------------------------------------------------------------------|
| bakery-bash   | Bakery Bash      | LIVE           | Strategy           | Competitive bakery sim. Players fight for revenue in a shared plaza.   |
| front-office  | Front Office     | IN DEVELOPMENT | Sports Analytics   | NBA general manager game. Build a dynasty with data-driven decisions.  |
| tutor         | Tutor            | IN DEVELOPMENT | Adaptive Learning  | An AI tutor that gamifies your own lesson material.                    |
| debate-arena  | Debate Arena     | CONCEPT        | Rhetoric           | Real-time debates against an AI opponent. Argument quality is scored.  |

### 5.4 Bakery Bash Featured Block

Full-width, comes after the Work grid.

- Left: large screenshot or animated loop of the game (placeholder image now, can drop a real screenshot/video file later)
- Right: 3-bullet feature list ("Five rounds of strategy" / "Compete against your classmates" / "Real-time leaderboard"), then a primary `Play the demo` CTA → `/demo/bakery-bash`
- Below: a 3-step "How it works" strip — **Pick strategy → Run the round → See results**

### 5.5 Team

- Heading: "Built by students. Advised by faculty."
- Sub: "Chapman University, 2026 cohort."
- Grid of 8 cards. Each card: geometric initial avatar (polygonal background echoing the FenriX logo), name, role, optional motto.
- Avatars use a deterministic hash of initials to pick polygon pattern + cyan/coral accent — feels cohesive without uniform.
- A `data-photo` attribute on each card lets us drop in real photo URLs later without code changes.

#### Team roster

| Name                  | Role                     | Notes                          |
|-----------------------|--------------------------|--------------------------------|
| Prof. Tim Frenzel     | Faculty Advisor          | "Do the Hard Things"           |
| Dylan Massaro         | Teaching Assistant       |                                |
| Katrina McCay         | Teaching Assistant       |                                |
| Mia Truong            | Teaching Assistant       |                                |
| Dylan Barlava         | Student Engineer         |                                |
| Kavin Ravi            | Student Engineer         |                                |
| Scott Switzer         | Student Engineer         |                                |
| Sofia Morales Vilchis | Student Engineer         |                                |

### 5.6 Affiliations (lightweight)

- "Built at" — Chapman University wordmark, monochrome, low-emphasis
- Optional row of 3-4 grayed-out placeholder slots for future sponsors/partners ("Want to see your logo here? Get in touch.")

### 5.7 Contact

- Heading: "Want to play, partner, or join?"
- Two-column on desktop, stacked on mobile.
- **Left column — direct paths:**
  - `Schools & sponsors:` mailto link
  - `Press inquiries:` mailto link
  - `Join FenriX:` short copy + link to GitHub org
- **Right column — form:**
  - Fields: Name (required) · Email (required) · Org / School (optional) · Topic (dropdown: Partnership · Sponsorship · Press · Joining · Other) · Message (required, textarea)
  - Honeypot field for bot protection
  - Client-side validation; server-side rules in Firestore
  - Submission: `addDoc()` to `contact_submissions` collection
  - Success state: "Thanks — we'll be in touch within 5 business days."
  - Failure state: "Something broke. Email us directly at [...]" with mailto fallback

### 5.8 Footer

- FenriX logo (small)
- Three columns:
  - **Studio:** Work · About · Team · Contact
  - **Connect:** GitHub (`fenrix-ai`) · Email
  - **Legal:** © 2026 FenriX · Chapman University
- Bottom-line: "Built by FenriX, with Claude."

## 6. Bakery Bash Demo Page (`/demo/bakery-bash`)

A non-functional but believable interactive mockup. Purpose: let a visitor "feel" the game without us hosting a real instance.

- **Top banner:** `● DEMO · NOT PLAYABLE · v1.0` pill
- **Layout:** mirrors the actual Bakery Bash UI styling (consult `games/bakery-bash/app/` for visual cues — same colors, fonts, basic component shapes)
- **Sidebar tabs (4 screens):**
  1. **Lobby** — mock player list (8 fake players), "Round 1 · Bidding closed" status, countdown timer (decorative)
  2. **Strategy** — pricing slider, ad spend slider, hire/fire buttons. Sliders move and update visible numbers but don't persist anywhere.
  3. **Round Results** — fake scoreboard, profit/loss waterfall chart (SVG, hard-coded data)
  4. **Leaderboard** — fake rankings table, sortable client-side
- All interactivity is local React state — no backend, no router state, no localStorage.
- "Back to FenriX" link in the top-left returns to `/`.

## 7. Tech Stack

- **Framework:** Vite + React 18 + TypeScript (matches Bakery Bash app stack)
- **Styling:** Tailwind CSS with a small custom token layer (CSS variables for the palette)
- **Routing:** React Router (`/` and `/demo/bakery-bash`)
- **Forms:** react-hook-form for Contact (lightweight validation)
- **Firebase:** Web SDK, lazy-loaded only when the contact form mounts (keeps homepage bundle slim)
- **Icons:** lucide-react
- **Fonts:** self-hosted via `@fontsource/inter`, `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono`

## 8. File Layout

```
website/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── firebase.json                  # hosting-only, scoped to this site
├── .firebaserc                    # links to bakery-bash-54d12 project
├── index.html
├── public/
│   └── fenrix-logo.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Router
│   ├── pages/
│   │   ├── Home.tsx
│   │   └── DemoBakeryBash.tsx
│   ├── sections/
│   │   ├── Hero.tsx
│   │   ├── Mission.tsx
│   │   ├── Work.tsx
│   │   ├── BakeryBashFeature.tsx
│   │   ├── Team.tsx
│   │   ├── Affiliations.tsx
│   │   ├── Contact.tsx
│   │   └── Footer.tsx
│   ├── components/
│   │   ├── Logo.tsx
│   │   ├── Nav.tsx
│   │   ├── ProjectCard.tsx
│   │   ├── TeamCard.tsx
│   │   ├── StatusPill.tsx
│   │   ├── GeometricAvatar.tsx
│   │   ├── ScrollReveal.tsx
│   │   └── demo/
│   │       ├── DemoShell.tsx
│   │       ├── LobbyScreen.tsx
│   │       ├── StrategyScreen.tsx
│   │       ├── ResultsScreen.tsx
│   │       └── LeaderboardScreen.tsx
│   ├── data/
│   │   ├── projects.ts
│   │   ├── team.ts
│   │   └── demo-fixtures.ts
│   ├── lib/
│   │   ├── firebase.ts            # lazy init
│   │   └── submit-contact.ts
│   └── styles/
│       ├── tokens.css             # CSS variables
│       └── globals.css
└── README.md
```

## 9. Component Boundaries

Each component does one thing:

- **Logo** — renders the SVG; takes `size` prop. No other logic.
- **Nav** — sticky top bar; reads anchor IDs from a const list. Toggle mobile menu locally.
- **ProjectCard** — pure render; takes a `Project` prop. Status pill + tagline + hover state.
- **TeamCard** — pure render; takes a `TeamMember` prop. Renders `GeometricAvatar` if no photo URL.
- **GeometricAvatar** — deterministic polygon pattern from initials. No external state.
- **ScrollReveal** — `IntersectionObserver` wrapper that adds a `.is-visible` class. Generic.
- **DemoShell** — owns demo navigation state (current tab). Renders the active screen.
- **Demo screens** — each owns its own local state (sliders, sort order). No shared state.

## 10. Data Flow

- **Static content** lives in `src/data/*.ts` files, typed. No CMS, no fetch — change copy = edit code.
- **Contact form** is the only dynamic piece: form submit → `submit-contact.ts` → Firestore `addDoc`.
- **Demo page** uses local React state only. No persistence.

## 11. Firebase Setup

- Use the existing `bakery-bash-54d12` project to avoid creating a new Firebase project.
- Add a new **hosting site** named `fenrix-site` to that project.
- The website's `firebase.json` declares only its own hosting target — no Functions, no Firestore rules from this directory.
- Firestore rules for `contact_submissions` live in `games/bakery-bash/backend/firestore.rules` (the existing rules file). We add a single block:

```
match /contact_submissions/{doc} {
  allow read: if false;
  allow create: if request.resource.data.email is string
             && request.resource.data.email.size() < 200
             && request.resource.data.message.size() < 4000;
  allow update, delete: if false;
}
```

(Read access via Firebase console only — no UI surfaces submissions.)

## 12. Deployment

```bash
cd website
npm install
npm run build           # outputs to website/dist
firebase deploy --only hosting:fenrix-site
```

The Bakery Bash deploy from `games/bakery-bash/app/` is unaffected — separate working dir, separate `firebase.json`.

## 13. Accessibility

- Color contrast: all text/background pairs meet WCAG AA (validated manually).
- Keyboard navigation: skip-to-content link, focus rings on all interactive elements.
- Forms: labels associated with inputs, error messages tied via `aria-describedby`.
- Reduced motion: respect `prefers-reduced-motion` (kills the eye pulse + scroll fades).
- Alt text on Logo, project images.

## 14. Performance Targets

- Lighthouse scores: 95+ Performance, 100 Accessibility, 100 Best Practices.
- First Contentful Paint < 1.0s on a fast 3G connection.
- Total JS bundle < 150KB gzipped (without Firebase).
- Firebase SDK lazy-loaded — contact form bundle ~50KB extra, only when the form mounts.

## 15. Out of Scope

- CMS / dynamic content management — content is in code.
- Auth / login.
- Real Bakery Bash game integration on the demo page — the page is a mockup.
- Analytics — can add Plausible or GA4 later.
- i18n.
- Blog, events log, or hackathon results — none in v1.

## 16. Open Questions / Risks

- **Real photos for the Team section** — placeholder avatars are good v1. Photos can drop in once we collect them.
- **Contact email addresses** — the spec assumes mailto links. We need at least one real email (likely a shared FenriX inbox or `frenzel.tim1@gmail.com` as listed in onboarding) before launch.
- **Sponsor/affiliation slots** — keep them as "Coming soon" placeholders, or hide section entirely until we have one? Default: keep with placeholders.

## 17. Success Criteria

- A school administrator can land on the homepage and within 30 seconds know what FenriX does and how to contact us.
- A prospective student can find the GitHub org and the team list.
- The Bakery Bash demo page makes the game feel real without us running a backend.
- The site deploys cleanly without breaking the Bakery Bash deploy.
- The whole site is one `firebase deploy` command from any team member's machine.
