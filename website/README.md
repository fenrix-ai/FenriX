# FenriX Website

Marketing site for FenriX. Single-page homepage at `/` plus a non-functional
Bakery Bash demo at `/demo/bakery-bash`. Deploys to Firebase Hosting as a
second site under the existing `bakery-bash-54d12` project.

## Stack

Vite · React 19 · TypeScript · Tailwind CSS · React Router 7 · Firebase Web SDK
· Vitest · react-hook-form · zod.

## Local dev

```bash
cd website
npm install
cp .env.example .env.local
# Then paste real values from:
#   firebase apps:sdkconfig WEB --project bakery-bash-54d12
npm run dev    # http://localhost:5175
```

## Tests

```bash
npm test           # run once
npm run test:watch # watch mode
```

Two TDD'd utilities: `GeometricAvatar` (initials + palette) and
`submit-contact` (Firestore write).

## First-time hosting setup

The `fenrix-site` hosting site is a separate site under the existing Firebase
project (`bakery-bash-54d12`). The Bakery Bash deploy is unaffected.

```bash
# Provision the site (one-time, requires owner on the Firebase project)
cd website
firebase hosting:sites:create fenrix-site --project bakery-bash-54d12
firebase target:apply hosting fenrix-site fenrix-site --project bakery-bash-54d12

# Deploy Firestore rules (which now include contact_submissions)
cd ../games/bakery-bash/backend
firebase deploy --only firestore:rules --project bakery-bash-54d12
```

If the site name `fenrix-site` is taken globally, pick another and update
`.firebaserc` + `firebase.json`.

## Deploy

```bash
cd website
npm run build
firebase deploy --only hosting:fenrix-site --project bakery-bash-54d12
```

The site goes live at `https://fenrix-site.web.app`.

## Editing content

All copy lives in code:
- `src/data/projects.ts` — project cards (status, name, tagline, etc.)
- `src/data/team.ts` — team roster
- `src/data/demo-fixtures.ts` — Bakery Bash demo data
- `src/sections/*.tsx` — section copy

Real photos for team members can be added via the `photo` field in
`team.ts` — the `GeometricAvatar` component falls back to the initials
pattern when no URL is set.

## Reading contact submissions

The contact form writes to Firestore collection `contact_submissions`. Open
the [Firebase console](https://console.firebase.google.com/project/bakery-bash-54d12/firestore)
and browse that collection.

Reads are denied client-side — only the console can list submissions. A
future improvement: a Cloud Function that emails a digest of new
submissions.
