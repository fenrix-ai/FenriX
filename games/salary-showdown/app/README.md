# Salary Showdown — Team Client (Plan 2)

React + Vite + Firebase JS SDK, always against the emulator suite in dev.

## Quickstart
1. Emulators: `cd ../backend/functions && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu`
2. Demo game: `npm run seed -- --to R1:FREE_AGENCY` (leaves Team Alpha's seats open;
   prints the join code; `--fill all` staffs every team, `--to R3:FRONT_OFFICE` /
   `--to FINALE` etc. jump phases)
3. App: `npm run dev` → http://localhost:5176/?code=<joinCode>

## Tests
- Unit: `npm test`
- Integration (needs the full emulator suite):
  `cd ../backend && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --project salary-showdown-dev --only functions,firestore,auth "cd ../app && npx vitest run -c vitest.integration.config.ts"`
- UI rules: `npm run audit:ui`

The Firestore/callable contract this client is written against is frozen in
`../backend/SCHEMA.md` + `../backend/README.md` and restated in the Plan 2
document (`docs/superpowers/plans/2026-07-16-salary-showdown-team-client.md`,
Global Constraints).
