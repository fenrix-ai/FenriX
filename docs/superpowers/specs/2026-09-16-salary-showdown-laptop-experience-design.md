# Salary Showdown: laptop experience design

Approved direction: preserve the navy/gold identity and make the experience feel like a franchise front office, with sports broadcast pacing around shared results. This document translates the conversation into implementation decisions; it does not change the simulation or classroom rules.

## Experience goals

1. A team feels like a franchise: monogram, chosen accent and jersey, visible teammates and roles, and a consistent team header.
2. Decision screens use laptop width for information and actions together. The player should not continually open and close a drawer to compare options.
3. Every action has a clear pending, success and failure state. Motion explains the change and never claims success before the server accepts it.
4. Simulation and finale deliver anticipation through the presentation of real results. The app does not invent possession-level events.
5. Professor and projector views work for a classroom of 21 franchises.

## Global constraints

- Scope: `games/salary-showdown` plus these Salary Showdown planning and handoff documents only.
- Preserve the navy/gold visual identity; team accents are decorative, never scores or recommendations.
- Target browser viewports: 1280×720, 1366×768, and 1440×900; support 1024px fallback and 200% zoom reflow.
- Keep React 19, TypeScript 6, Vite 8, Firebase, existing dnd-kit, and handwritten SVG charts; add no runtime dependencies.
- Preserve five rounds, the $100M cap, all existing phases, server authority, callable mutation paths, and existing role fallback rules.
- Ordinary free agents are non-exclusive across teams; never mark them globally taken or unavailable because another team signed them.
- Gameplay displays raw data and permitted arithmetic only; never add player ratings, value scores, hidden weights, projected wins, or claimed lineup synergies.
- Render hype with the existing star/half-star glyphs during play; numeric hype is allowed only in the sanctioned finale chart. Do not add UI emojis.
- Preserve exact playstyle names and blurbs from `types/models.ts`; court decoration must not imply new simulation mechanics.
- Auction exposure above the cap remains legal; warn without disabling valid bids. Private bids and private skip reasons remain team-private.
- Done is a status signal, not a submission lock; revisions stay available until the phase ends. Timers remain advisory.
- Preserve transition-marker gating and expectedPhase/expectedRound on advancement; never route or reveal ahead of the gated phase.
- Preserve all lineup pids and bench ordering; only the first two bench entries are active, later depth receives zero minutes.
- Preserve server standings order and all 23 raw boxscore columns; CSV export must preserve the server bytes.
- Reveal hidden model data only in FINALE; laptop debrief remains independently browsable while the professor controls only the projector reveal step.
- Respect reduced motion, keyboard operation, visible focus, and readable contrast; no essential information may depend on animation or color alone.
- Do not deploy, change production games, or edit unrelated folders as part of UI implementation tasks.

## Visual and layout decisions

Retain the dark navy canvas, gold primary action, existing type families and financial number treatment. Add stronger hierarchy: quiet compact metadata, distinct selected player/team surfaces, and larger key decisions. Use tabular numerals for changing financial numbers. A team accent appears on its crest, jersey, selection edge and court badge; gold remains the main action color.

Student shell: a compact persistent header with franchise, role, current phase/round, safe-to-display record, advisory timer and Standings. The content width grows to 1600px. On decision screens, the central workspace and a 300–340px detail/action rail coexist. A third roster rail may be 240–280px at sufficiently wide viewports; at narrower widths it becomes an explicitly labelled drawer. Use minmax(0, 1fr), not fixed total widths. Tables own their horizontal scrolling; the page itself must not scroll sideways. Sticky headers must not cover focus or stack over one another.

Market and results tables remain dense enough for comparison, with clear row hover/focus, sticky name and column headings, and readable 13–14px body text. Primary controls remain comfortably clickable. Forms retain user edits across unrelated snapshots. During a pointer or keyboard interaction, no animated reordering moves the target away.

## Screen requirements

| Screen | Result |
| --- | --- |
| Join | A purposeful welcome followed by league, franchise and role steps. Show progress, preserve entry on back/error, and support late joining according to existing server rules. |
| Lobby | Own-franchise feature panel, three named role seats, explicit seat ownership and teammate arrivals, other teams grid. Lobby-only accent/jersey editor with live local preview and explicit Save. Monogram derives from the team name. |
| Market / draft | Wide searchable/sortable catalog, persistent player card and contract composer, roster needs and payroll preview, 2–3 player comparison tray using raw columns. Successful signing connects the selected player to the roster through a brief visual receipt. |
| Front office | Expiring decisions beside a five-round payroll timeline. Preview re-sign terms and show cut/dead-money consequences. Let walk is a reversible local choice, not a server transaction. |
| Auction | Larger player showcase cards; rate and duration controls; clear guaranteed total and combined offer summary. Show SEALED only after success; allow revision and preserve edits. Public winners are revealed only after auction resolution. |
| Lineup | Large half court and adjacent roster/playstyle workspace. Drag lift, eligible destinations, legal swaps and explicit rejection. Click or keyboard-select a player and then choose a slot. Distinguish sixth, two active bench places and inactive depth. |
| Simulation | Real matchup intro, suspenseful final score reveal, completed-game strip, progressive record and standings, and completed-match boxscore expansion. Show a meaningful loading state before the round document exists. |
| Results | Record/rank hero, awards and standings visible together; details below with game/player filters, full raw table and unchanged CSV. Preserve auction resolution and own-team skip feedback already implemented. |
| Standings | Own-team emphasis, rank movement from previousRank, and per-round exploration. Use server ordering; zero-spend efficiency remains an em dash. |
| Finale | Staged podium, brief gold celebration, personal signing story, interactive chart inspection and filters based on sanctioned reveal data. Readable unclipped labels and independently browsable student debrief. |
| Professor | Wide control desk; sticky phase/timer/advance controls, franchise submission grid, secondary seat tools, clear pending/errors and 21-team handling. |
| Projector | Screen-sized charts, deliberately paced simulation/standings/podium, and readable 21-team layouts. Remains read-only and follows the professor's reveal step. |

## Motion specification

| Event | Default | Reduced motion |
| --- | --- | --- |
| Hover, press, focus, selection | 120–160ms color/opacity and at most 2px translation | Instant state change |
| Panel or step change | 200–240ms opacity/translation | Instant; focus transferred appropriately |
| Accepted signing, sealing, lineup | 350–450ms emphasis or short transfer; receipt stays readable | Text/status receipt without travel |
| Phase change | One transition up to 700ms, never blocks input | Immediate |
| Match reveal | Intro then actual final score; no fictional scoring history | Immediately show available completed results or explicit reveal control |
| Standings move | Up to 600ms, preserve stable row keys | Immediate final placement |
| Finale podium | Reveal places sequentially, 1–2 seconds per step; Skip available | Full podium immediately |
| Celebration | Gold confetti up to 2.5 seconds, once per game/viewer | None |

Use CSS and native browser animation APIs, not a new animation library. Cancel timers/animations on unmount, scope changes and reduced-motion changes. Background tab return computes elapsed progress once; do not burst all missed events. Receipts are attached to successful user actions, not initial snapshot reads. Do not replay celebrations from an unrelated rerender. Amount interpolation is decorative; screen readers receive the settled value once.

## Data and reveal boundaries

The server writes final team totals and the full round document before the visual simulation completes. Shared student presentation state must determine what is shown during SIMULATE. Derive intermediate records with existing `liveStandings`, never directly display final `TeamDoc.wins` during that phase. Navigation to Standings must not bypass the reveal. Previous completed rounds can be browsed normally; Results exposes the current completed round.

Student and projector share progression rules but need not have identical clocks: there is no authoritative reveal-start timestamp today. Do not add a gameplay timestamp merely for decorative synchronization. Each surface may use its own scoped presentation clock. Phase/round changes clear the local scope.

Use existing snapshots and a bounded round-document cache. No listener per card, chart, row or player. New team-seat display reuses the existing same-team membership query. No subscription to opponent private documents.

Boxscore rows identify team names, while game results identify teams by ID. Duplicate team names are possible. Filter completed boxscores by game_id; when names collide, show the full matchup boxscore with a neutral ambiguity note instead of claiming a row belongs to one franchise. Do not change the wire/CSV schema for this redesign.

## Cosmetic identity contract

Optional `TeamDoc.identity = { accent, jersey }`:

- accent: gold, teal, coral, violet, sky or mint.
- jersey: classic, stripe or chevron.
- No arbitrary color strings, image URLs or uploads.
- Missing metadata gets a deterministic fallback derived from teamId; old games require no migration.
- A lobby member saves their own team's identity via additive `setTeamIdentity({ gameId, identity }) -> { ok: true }`.
- The callable derives teamId from membership, validates enum values, and transactionally checks lobby state before updating. Identity updates and startSeason cannot race past that gate.
- Existing `getLobby` may return optional identity alongside its existing public fields; do not expose roster or private state.

## Delivery and acceptance

Build shared primitives and additive backend identity independently, then the shared student shell/presentation contract. After that, ten screen workstreams have exclusive files and can run concurrently in separate worktrees. Merge at explicit gates and verify the classroom flow in an integration workstream. Every session receives a standalone task packet with constraints, API contracts, exclusive files, tests, manual checks and a copyable launch prompt.

No new phases, sound design, trades, playoffs, custom image upload, simulation changes, or design-system rewrite outside Salary Showdown. Deferred released-seat auto-routing remains a separate existing catch-up item; record any observed regression without silently expanding scope.
