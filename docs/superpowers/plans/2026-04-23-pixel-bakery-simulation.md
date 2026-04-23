# Pixel Bakery Simulation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the emoji-based between-round simulation in Bakery Bash with a Stardew-style pixel-art interior scene where customers walk in, buy, and exit — dollar-bill flurries burst on every sale.

**Architecture:** DOM/CSS sprites rendered inside the existing `SimulatePhase` center slot. A single `useSceneAnimation` hook owns all mutable scene state (customer actors, dollar popups) via `requestAnimationFrame` + `setTimeout` spawn scheduler. Presentational child components read props only. Data inputs flow one-way from the existing `useGame()` context — no backend or schema changes.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + React Testing Library + jsdom, plain CSS with `image-rendering: pixelated`, inline SVG assets. No new runtime deps.

**Spec:** [docs/superpowers/specs/2026-04-23-pixel-bakery-simulation-design.md](../specs/2026-04-23-pixel-bakery-simulation-design.md)

---

## Phase 0 — Test Tooling Bootstrap

The frontend has Vitest installed but no test config or test files. Without this phase, TDD is impossible.

### Task 0.1: Wire up Vitest + Testing Library

**Files:**
- Modify: `games/bakery-bash/app/vite.config.ts`
- Create: `games/bakery-bash/app/src/test-setup.ts`
- Create: `games/bakery-bash/app/src/__sanity__/test-setup.test.ts`

- [ ] **Step 1: Add Vitest + jsdom config to vite.config.ts**

Replace the file contents with:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
})
```

- [ ] **Step 2: Create the test setup file**

Write `games/bakery-bash/app/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 3: Write a sanity test**

Write `games/bakery-bash/app/src/__sanity__/test-setup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('runs in jsdom', () => {
    expect(typeof document).toBe('object')
    expect(document.body).toBeTruthy()
  })
})
```

- [ ] **Step 4: Run the sanity test — expect PASS**

From `games/bakery-bash/app/`:

```bash
npm test -- src/__sanity__
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/vite.config.ts \
        games/bakery-bash/app/src/test-setup.ts \
        games/bakery-bash/app/src/__sanity__/test-setup.test.ts
git commit -m "$(cat <<'EOF'
chore(bakery-bash): wire up Vitest + Testing Library for frontend

Adds jsdom environment, globals, and a test-setup file that installs
jest-dom matchers and runs Testing Library cleanup between tests.
One sanity test confirms the pipeline works.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 — Animation Engine (TDD)

All scene logic lives in `useSceneAnimation`. TDD it in isolation, then wire it up.

**Design notes for the hook:**
- Signature: `useSceneAnimation(config) → { customers, dollars }`
- Config: `{ customerCount, simDurationMs, isNight, reducedMotion }`
- Uses `setTimeout` for spawn scheduling (easier to fake-timer than RAF)
- Uses `requestAnimationFrame` for actor position updates
- All timers cleaned up on unmount
- `document.visibilityState` checked inside the RAF loop to pause when tab hidden

### Task 1.1: Types + reduced-motion short-circuit

**Files:**
- Create: `games/bakery-bash/app/src/hooks/useSceneAnimation.ts`
- Create: `games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSceneAnimation } from '../useSceneAnimation'

describe('useSceneAnimation — reduced motion', () => {
  it('returns empty arrays and starts no loop when reducedMotion is true', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: true,
      })
    )

    expect(result.current.customers).toEqual([])
    expect(result.current.dollars).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

```bash
cd games/bakery-bash/app && npm test -- hooks/__tests__/useSceneAnimation
```

Expected: fails because `useSceneAnimation` does not exist yet.

- [ ] **Step 3: Minimal implementation**

Create `games/bakery-bash/app/src/hooks/useSceneAnimation.ts`:

```ts
export interface CustomerActor {
  id: string
  variantIdx: number
  phase: 'WALK_IN' | 'AT_COUNTER' | 'WALK_OUT'
  x: number
  targetX: number
  phaseStart: number
}

export interface DollarPopup {
  id: string
  x: number
  y: number
  bornAt: number
}

export interface SceneAnimationConfig {
  customerCount: number
  simDurationMs: number
  isNight: boolean
  reducedMotion: boolean
}

export interface SceneAnimationState {
  customers: CustomerActor[]
  dollars: DollarPopup[]
}

export function useSceneAnimation(
  config: SceneAnimationConfig,
): SceneAnimationState {
  if (config.reducedMotion) {
    return { customers: [], dollars: [] }
  }
  return { customers: [], dollars: [] }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useSceneAnimation.ts \
        games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): scaffold useSceneAnimation with reduced-motion short-circuit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.2: Spawn scheduler — base interval

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useSceneAnimation.ts`
- Modify: `games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the test file:

```tsx
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('useSceneAnimation — spawn interval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('spawns first customer after roughly (simDurationMs / customerCount) ms', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    expect(result.current.customers).toHaveLength(0)

    // base interval = 1500ms. Advance past the upper jitter bound (1.25x = 1875ms)
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.customers.length).toBeGreaterThanOrEqual(1)
  })

  it('spawns at ghost-town pace when customerCount is small', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 10,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    // base interval = 12_000ms. After 5s, no spawn yet.
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.customers).toHaveLength(0)
  })
})
```

Note: the existing "reduced motion" test above stays — do not delete.

- [ ] **Step 2: Run test — expect FAIL (customers stay empty)**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 3: Implement the scheduler**

Replace the hook body (keep the types above untouched):

```ts
import { useEffect, useState } from 'react'

const JITTER = 0.25
const MAX_CUSTOMERS = 12

function nextSpawnDelay(base: number) {
  const low = base * (1 - JITTER)
  const high = base * (1 + JITTER)
  return low + Math.random() * (high - low)
}

export function useSceneAnimation(
  config: SceneAnimationConfig,
): SceneAnimationState {
  const [customers, setCustomers] = useState<CustomerActor[]>([])
  const [dollars] = useState<DollarPopup[]>([])

  useEffect(() => {
    if (config.reducedMotion || config.customerCount <= 0) return

    const baseInterval = config.simDurationMs / config.customerCount
    let nextId = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const scheduleNext = () => {
      timer = setTimeout(() => {
        setCustomers((prev) => {
          if (prev.length >= MAX_CUSTOMERS) return prev
          const id = `c${nextId++}`
          const variantIdx = Math.floor(Math.random() * 4)
          const targetX = 180 + Math.floor(Math.random() * 120)
          return [
            ...prev,
            {
              id,
              variantIdx,
              phase: 'WALK_IN' as const,
              x: 480,
              targetX,
              phaseStart: performance.now(),
            },
          ]
        })
        scheduleNext()
      }, nextSpawnDelay(baseInterval))
    }

    scheduleNext()

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [config.customerCount, config.simDurationMs, config.reducedMotion])

  if (config.reducedMotion) {
    return { customers: [], dollars: [] }
  }

  return { customers, dollars }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useSceneAnimation.ts \
        games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): spawn scheduler driven by customerCount

Base interval = simDurationMs / customerCount with ±25% jitter. Tested
at busy and ghost-town volumes with fake timers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.3: Actor phase transitions (walk-in → counter → walk-out)

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useSceneAnimation.ts`
- Modify: `games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
describe('useSceneAnimation — actor lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances a customer from WALK_IN to AT_COUNTER when x reaches targetX', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    // Spawn a customer
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.customers.length).toBeGreaterThanOrEqual(1)
    const spawned = result.current.customers[0]
    expect(spawned.phase).toBe('WALK_IN')

    // Walk speed is 60 logical px/s; walk distance ≈ 480 - targetX.
    // After 4s of ticking, they should reach the counter (AT_COUNTER).
    act(() => {
      vi.advanceTimersByTime(4000)
    })

    const customerNow = result.current.customers.find((c) => c.id === spawned.id)
    expect(customerNow?.phase === 'AT_COUNTER' || customerNow?.phase === 'WALK_OUT').toBe(true)
  })

  it('removes the customer from state after WALK_OUT completes', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const spawnedId = result.current.customers[0].id

    // Full lifecycle: walk-in (~1.7s) + pause (~0.75s) + walk-out (~1.7s) ≈ 4.15s
    // Pad to 8s to be safe.
    act(() => {
      vi.advanceTimersByTime(8000)
    })

    expect(result.current.customers.find((c) => c.id === spawnedId)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 3: Implement the tick loop**

Replace the hook body so the `useEffect` also schedules a tick:

```ts
const WALK_SPEED_PX_PER_SEC = 60
const AT_COUNTER_MIN_MS = 600
const AT_COUNTER_MAX_MS = 900
const EXIT_X = 500
const TICK_MS = 1000 / 30 // 30 Hz position update

export function useSceneAnimation(
  config: SceneAnimationConfig,
): SceneAnimationState {
  const [customers, setCustomers] = useState<CustomerActor[]>([])
  const [dollars] = useState<DollarPopup[]>([])

  useEffect(() => {
    if (config.reducedMotion || config.customerCount <= 0) return

    const baseInterval = config.simDurationMs / config.customerCount
    let nextId = 0
    let spawnTimer: ReturnType<typeof setTimeout> | null = null
    let tickTimer: ReturnType<typeof setInterval> | null = null
    let lastTick = performance.now()

    const scheduleNextSpawn = () => {
      spawnTimer = setTimeout(() => {
        setCustomers((prev) => {
          if (prev.length >= MAX_CUSTOMERS) return prev
          const id = `c${nextId++}`
          return [
            ...prev,
            {
              id,
              variantIdx: Math.floor(Math.random() * 4),
              phase: 'WALK_IN',
              x: 480,
              targetX: 180 + Math.floor(Math.random() * 120),
              phaseStart: performance.now(),
            },
          ]
        })
        scheduleNextSpawn()
      }, nextSpawnDelay(baseInterval))
    }

    const tick = () => {
      const now = performance.now()
      const dt = (now - lastTick) / 1000
      lastTick = now

      setCustomers((prev) =>
        prev
          .map((c) => advanceActor(c, dt, now))
          .filter((c): c is CustomerActor => c !== null),
      )
    }

    scheduleNextSpawn()
    tickTimer = setInterval(tick, TICK_MS)

    return () => {
      if (spawnTimer) clearTimeout(spawnTimer)
      if (tickTimer) clearInterval(tickTimer)
    }
  }, [config.customerCount, config.simDurationMs, config.reducedMotion])

  if (config.reducedMotion) {
    return { customers: [], dollars: [] }
  }

  return { customers, dollars }
}

function advanceActor(
  c: CustomerActor,
  dt: number,
  now: number,
): CustomerActor | null {
  if (c.phase === 'WALK_IN') {
    const nextX = c.x - WALK_SPEED_PX_PER_SEC * dt
    if (nextX <= c.targetX) {
      return { ...c, x: c.targetX, phase: 'AT_COUNTER', phaseStart: now }
    }
    return { ...c, x: nextX }
  }
  if (c.phase === 'AT_COUNTER') {
    const elapsed = now - c.phaseStart
    const dwell =
      AT_COUNTER_MIN_MS +
      (AT_COUNTER_MAX_MS - AT_COUNTER_MIN_MS) * (Math.abs(Math.sin(c.phaseStart)) || 0.5)
    if (elapsed >= dwell) {
      return { ...c, phase: 'WALK_OUT', phaseStart: now }
    }
    return c
  }
  // WALK_OUT
  const nextX = c.x + WALK_SPEED_PX_PER_SEC * dt
  if (nextX >= EXIT_X) return null
  return { ...c, x: nextX }
}
```

Note: uses `setInterval` for tick rather than `requestAnimationFrame` so the tests' `vi.useFakeTimers()` can advance it. The actual frame rate (30 Hz) is fine for this scene.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useSceneAnimation.ts \
        games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): actor phase state machine (walk-in → counter → walk-out)

Adds a 30 Hz tick loop that advances actors through their three phases
and despawns them past the exit threshold. Walk speed is 60 logical px/s.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.4: Dollar popups on sale

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useSceneAnimation.ts`
- Modify: `games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
describe('useSceneAnimation — dollar popups', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('spawns 4–6 dollar popups when a customer reaches the counter', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    // Drive past spawn + walk-in completion + a bit into AT_COUNTER for the flurry
    act(() => {
      vi.advanceTimersByTime(2000) // spawn
    })
    act(() => {
      vi.advanceTimersByTime(4500) // walk-in completes, flurry fires
    })

    expect(result.current.dollars.length).toBeGreaterThanOrEqual(4)
    expect(result.current.dollars.length).toBeLessThanOrEqual(6)
  })

  it('drains dollar popups after their ~900ms lifetime', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(result.current.dollars.length).toBeGreaterThan(0)

    // Let every popup's lifetime expire
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.dollars).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 3: Implement the flurry + cleanup**

Modify the hook: change `const [dollars]` to `const [dollars, setDollars]`, track a set of actors already paid so we don't double-fire, and emit dollars when an actor first enters `AT_COUNTER`.

Add these constants at the top of the module:

```ts
const DOLLAR_LIFETIME_MS = 900
const FLURRY_MIN = 4
const FLURRY_MAX = 6
```

Update the hook body:

```ts
export function useSceneAnimation(
  config: SceneAnimationConfig,
): SceneAnimationState {
  const [customers, setCustomers] = useState<CustomerActor[]>([])
  const [dollars, setDollars] = useState<DollarPopup[]>([])

  useEffect(() => {
    if (config.reducedMotion || config.customerCount <= 0) return

    const baseInterval = config.simDurationMs / config.customerCount
    let nextCustomerId = 0
    let nextDollarId = 0
    const paid = new Set<string>()
    let spawnTimer: ReturnType<typeof setTimeout> | null = null
    let tickTimer: ReturnType<typeof setInterval> | null = null
    const dollarTimers: ReturnType<typeof setTimeout>[] = []
    let lastTick = performance.now()

    const scheduleNextSpawn = () => {
      spawnTimer = setTimeout(() => {
        setCustomers((prev) => {
          if (prev.length >= MAX_CUSTOMERS) return prev
          const id = `c${nextCustomerId++}`
          return [
            ...prev,
            {
              id,
              variantIdx: Math.floor(Math.random() * 4),
              phase: 'WALK_IN',
              x: 480,
              targetX: 180 + Math.floor(Math.random() * 120),
              phaseStart: performance.now(),
            },
          ]
        })
        scheduleNextSpawn()
      }, nextSpawnDelay(baseInterval))
    }

    const emitFlurry = (x: number) => {
      const count = FLURRY_MIN + Math.floor(Math.random() * (FLURRY_MAX - FLURRY_MIN + 1))
      const born = performance.now()
      const fresh: DollarPopup[] = []
      for (let i = 0; i < count; i++) {
        const id = `d${nextDollarId++}`
        fresh.push({ id, x: x + (Math.random() * 16 - 8), y: 110, bornAt: born })
        const timer = setTimeout(() => {
          setDollars((prev) => prev.filter((d) => d.id !== id))
        }, DOLLAR_LIFETIME_MS)
        dollarTimers.push(timer)
      }
      setDollars((prev) => [...prev, ...fresh])
    }

    const tick = () => {
      const now = performance.now()
      const dt = (now - lastTick) / 1000
      lastTick = now

      setCustomers((prev) => {
        const next: CustomerActor[] = []
        for (const c of prev) {
          const advanced = advanceActor(c, dt, now)
          if (advanced === null) continue
          // Trigger sale the first time an actor hits AT_COUNTER
          if (advanced.phase === 'AT_COUNTER' && !paid.has(advanced.id)) {
            paid.add(advanced.id)
            emitFlurry(advanced.x)
          }
          next.push(advanced)
        }
        return next
      })
    }

    scheduleNextSpawn()
    tickTimer = setInterval(tick, TICK_MS)

    return () => {
      if (spawnTimer) clearTimeout(spawnTimer)
      if (tickTimer) clearInterval(tickTimer)
      for (const t of dollarTimers) clearTimeout(t)
    }
  }, [config.customerCount, config.simDurationMs, config.reducedMotion])

  if (config.reducedMotion) {
    return { customers: [], dollars: [] }
  }

  return { customers, dollars }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useSceneAnimation.ts \
        games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): dollar-bill flurry on sale with auto-drain

When a customer first enters AT_COUNTER, emit 4–6 dollar popups near
the counter x; each auto-removes after 900ms.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.5: Soft cap at 12 concurrent customers

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx`

The cap is already implemented in 1.2 (the `prev.length >= MAX_CUSTOMERS` guard). This task only adds a test to pin the behavior.

- [ ] **Step 1: Write the test**

Append to the test file:

```tsx
describe('useSceneAnimation — soft cap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('never holds more than 12 active customers even under packed load', () => {
    const { result } = renderHook(() =>
      useSceneAnimation({
        customerCount: 1000, // extreme — base interval = 120ms
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )

    // Let ~30s of sim time pass — well past what would overflow
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(result.current.customers.length).toBeLessThanOrEqual(12)
  })
})
```

- [ ] **Step 2: Run test — expect PASS (already implemented)**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 3: Commit**

```bash
git add games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx
git commit -m "$(cat <<'EOF'
test(bakery-bash): pin soft cap at 12 concurrent customers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.6: `isNight` pauses spawns

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useSceneAnimation.ts`
- Modify: `games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
describe('useSceneAnimation — isNight pause', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not spawn customers while isNight is true', () => {
    const { rerender, result } = renderHook(
      (isNight: boolean) =>
        useSceneAnimation({
          customerCount: 80,
          simDurationMs: 120_000,
          isNight,
          reducedMotion: false,
        }),
      { initialProps: true },
    )

    // With isNight=true, no spawns after 10s
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.customers).toHaveLength(0)

    // Flip to daytime — spawns resume
    rerender(false)
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(result.current.customers.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 3: Wire isNight into scheduler**

Use a ref so the running scheduler reads the latest `isNight` without triggering an effect re-mount, and add `isNight` to the effect dependency list. Update the hook:

```ts
import { useEffect, useRef, useState } from 'react'

// ... inside hook body, just above the effect:
const isNightRef = useRef(config.isNight)
isNightRef.current = config.isNight
```

Then inside `scheduleNextSpawn`, skip the spawn when it's night:

```ts
const scheduleNextSpawn = () => {
  spawnTimer = setTimeout(() => {
    if (!isNightRef.current) {
      setCustomers((prev) => {
        if (prev.length >= MAX_CUSTOMERS) return prev
        const id = `c${nextCustomerId++}`
        return [
          ...prev,
          {
            id,
            variantIdx: Math.floor(Math.random() * 4),
            phase: 'WALK_IN',
            x: 480,
            targetX: 180 + Math.floor(Math.random() * 120),
            phaseStart: performance.now(),
          },
        ]
      })
    }
    scheduleNextSpawn()
  }, nextSpawnDelay(baseInterval))
}
```

Keep the effect deps as `[config.customerCount, config.simDurationMs, config.reducedMotion]` — the ref handles `isNight` live without remounting the scheduler.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useSceneAnimation.ts \
        games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): pause customer spawns during night phase

Scheduler reads latest isNight via ref — no remount on day/night flip.
In-flight actors finish their current phase naturally.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.7: Visibility pause + unmount cleanup

**Files:**
- Modify: `games/bakery-bash/app/src/hooks/useSceneAnimation.ts`
- Modify: `games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
describe('useSceneAnimation — cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('leaves no pending timers after unmount', () => {
    const { unmount } = renderHook(() =>
      useSceneAnimation({
        customerCount: 80,
        simDurationMs: 120_000,
        isNight: false,
        reducedMotion: false,
      })
    )
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test — expect PASS if cleanup is correct, else fix**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

Note: if this fails, the earlier cleanup clause is missing a timer handle. Double-check the effect returns clear every `dollarTimers` entry and the `spawnTimer` + `tickTimer`. The implementation in 1.4 already covers this — this test simply pins it.

- [ ] **Step 3: Add visibility pause (skip tick when hidden)**

In the `tick` function, add a guard at the top:

```ts
const tick = () => {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    lastTick = performance.now() // avoid a dt spike on resume
    return
  }
  const now = performance.now()
  const dt = (now - lastTick) / 1000
  lastTick = now
  // ... rest unchanged
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- hooks/__tests__/useSceneAnimation
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/hooks/useSceneAnimation.ts \
        games/bakery-bash/app/src/hooks/__tests__/useSceneAnimation.test.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): pause ticks when tab is hidden; pin cleanup test

Prevents a dt spike and queue buildup after the tab returns to focus.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — SVG Assets

Create simple, readable pixel-style SVGs. Not art-school pretty — just legible chunky blocks in the Stardew palette (warm browns, creams, soft greens). Each SVG is authored on a small viewBox (`viewBox="0 0 N N"`) so CSS `image-rendering: pixelated` preserves block edges when scaled.

### Task 2.1: Scene backdrop + counter + floor + door

**Files:**
- Create: `games/bakery-bash/assets/svg/scene/interior-backwall.svg`
- Create: `games/bakery-bash/assets/svg/scene/counter.svg`
- Create: `games/bakery-bash/assets/svg/scene/floor.svg`
- Create: `games/bakery-bash/assets/svg/scene/door.svg`

- [ ] **Step 1: Create `interior-backwall.svg`**

A full-width back wall (viewBox `0 0 480 160`) with warm cream paint, three dark-wood shelf boards at y=40, y=70, y=100, a window on the left with a blue sky square, and a chalkboard rectangle on the right.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160" shape-rendering="crispEdges">
  <rect width="480" height="160" fill="#F4E4C1"/>
  <!-- wainscoting -->
  <rect y="130" width="480" height="30" fill="#8B5E3C"/>
  <rect y="128" width="480" height="2" fill="#5A3A20"/>
  <!-- window -->
  <rect x="30" y="20" width="90" height="70" fill="#6FA8DC"/>
  <rect x="28" y="18" width="94" height="74" fill="none" stroke="#4A2E1A" stroke-width="4"/>
  <line x1="75" y1="20" x2="75" y2="90" stroke="#4A2E1A" stroke-width="3"/>
  <line x1="30" y1="55" x2="120" y2="55" stroke="#4A2E1A" stroke-width="3"/>
  <!-- shelves -->
  <rect x="160" y="38"  width="280" height="6" fill="#6B3F1F"/>
  <rect x="160" y="68"  width="280" height="6" fill="#6B3F1F"/>
  <rect x="160" y="98"  width="280" height="6" fill="#6B3F1F"/>
  <!-- chalkboard -->
  <rect x="340" y="18" width="110" height="60" fill="#2A3B2A" stroke="#6B3F1F" stroke-width="4"/>
</svg>
```

- [ ] **Step 2: Create `counter.svg`**

Counter running full width at `viewBox="0 0 480 80"` — top surface, glass display case in the middle, wood panels below.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 80" shape-rendering="crispEdges">
  <!-- counter top -->
  <rect y="0" width="480" height="8" fill="#C9A978"/>
  <rect y="8" width="480" height="4" fill="#8B6A3A"/>
  <!-- glass case -->
  <rect y="12" width="480" height="34" fill="#DDEBF5" fill-opacity="0.7"/>
  <rect y="12" width="480" height="2" fill="#A7C3D5"/>
  <rect y="44" width="480" height="2" fill="#8B6A3A"/>
  <!-- wooden front panels -->
  <rect y="46" width="480" height="34" fill="#8B5E3C"/>
  <line x1="0" y1="46" x2="0" y2="80" stroke="#5A3A20" stroke-width="4"/>
  <line x1="120" y1="46" x2="120" y2="80" stroke="#5A3A20" stroke-width="2"/>
  <line x1="240" y1="46" x2="240" y2="80" stroke="#5A3A20" stroke-width="2"/>
  <line x1="360" y1="46" x2="360" y2="80" stroke="#5A3A20" stroke-width="2"/>
  <line x1="479" y1="46" x2="479" y2="80" stroke="#5A3A20" stroke-width="4"/>
</svg>
```

- [ ] **Step 3: Create `floor.svg`**

Wood-plank floor (`viewBox="0 0 480 30"`), five horizontal plank seams.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 30" shape-rendering="crispEdges">
  <rect width="480" height="30" fill="#A07B52"/>
  <line x1="0" y1="6"  x2="480" y2="6"  stroke="#7A5A38" stroke-width="1"/>
  <line x1="0" y1="14" x2="480" y2="14" stroke="#7A5A38" stroke-width="1"/>
  <line x1="0" y1="22" x2="480" y2="22" stroke="#7A5A38" stroke-width="1"/>
  <!-- plank seams -->
  <line x1="60"  y1="0" x2="60"  y2="14" stroke="#6B4A2A" stroke-width="1"/>
  <line x1="180" y1="14" x2="180" y2="30" stroke="#6B4A2A" stroke-width="1"/>
  <line x1="300" y1="0" x2="300" y2="14" stroke="#6B4A2A" stroke-width="1"/>
  <line x1="420" y1="14" x2="420" y2="30" stroke="#6B4A2A" stroke-width="1"/>
</svg>
```

- [ ] **Step 4: Create `door.svg`**

A right-edge door (`viewBox="0 0 40 80"`) — dark wood with a small window and a brass handle.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 80" shape-rendering="crispEdges">
  <rect x="2" y="2" width="36" height="76" fill="#5A3A20" stroke="#2F1D0F" stroke-width="2"/>
  <rect x="10" y="12" width="20" height="20" fill="#6FA8DC" stroke="#2F1D0F" stroke-width="2"/>
  <circle cx="32" cy="48" r="2" fill="#E5C547"/>
</svg>
```

- [ ] **Step 5: Sanity check — view SVGs in browser**

Open each file in a browser or VS Code's preview to confirm they render.

- [ ] **Step 6: Commit**

```bash
git add games/bakery-bash/assets/svg/scene/
git commit -m "$(cat <<'EOF'
feat(bakery-bash): pixel-style scene assets — backwall, counter, floor, door

Simple chunky SVGs for the interior. Palette is Stardew warm woods and
cream. All authored small so image-rendering: pixelated keeps edges crisp.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.2: Wooden sign, dollar bill, empty tray

**Files:**
- Create: `games/bakery-bash/assets/svg/scene/wooden-sign.svg`
- Create: `games/bakery-bash/assets/svg/scene/dollar-bill.svg`
- Create: `games/bakery-bash/assets/svg/scene/shelf-product-empty.svg`

- [ ] **Step 1: Create `wooden-sign.svg`**

Hanging sign frame (`viewBox="0 0 200 60"`) — two ropes on top, carved plank body. The team name will render as HTML text on top of it, not as part of the SVG.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" shape-rendering="crispEdges">
  <!-- ropes -->
  <line x1="40"  y1="0" x2="30"  y2="12" stroke="#8B6A3A" stroke-width="3"/>
  <line x1="160" y1="0" x2="170" y2="12" stroke="#8B6A3A" stroke-width="3"/>
  <!-- plank -->
  <rect x="20" y="12" width="160" height="40" fill="#B8865C" stroke="#5A3A20" stroke-width="3"/>
  <rect x="24" y="16" width="152" height="4" fill="#D7AE85"/>
  <rect x="24" y="46" width="152" height="2" fill="#8B6A3A"/>
</svg>
```

- [ ] **Step 2: Create `dollar-bill.svg`**

Small green bill (`viewBox="0 0 24 14"`).

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 14" shape-rendering="crispEdges">
  <rect width="24" height="14" fill="#7FB87F" stroke="#3F723F" stroke-width="1"/>
  <rect x="2" y="2" width="20" height="10" fill="none" stroke="#3F723F" stroke-width="1"/>
  <text x="12" y="11" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#1E4D1E">$</text>
</svg>
```

- [ ] **Step 3: Create `shelf-product-empty.svg`**

Small empty tray tile (`viewBox="0 0 24 16"`).

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16" shape-rendering="crispEdges">
  <rect x="2" y="8" width="20" height="6" fill="#C9A978" stroke="#6B4A2A" stroke-width="1"/>
  <rect x="2" y="8" width="20" height="2" fill="#B8865C"/>
</svg>
```

- [ ] **Step 4: Commit**

```bash
git add games/bakery-bash/assets/svg/scene/
git commit -m "$(cat <<'EOF'
feat(bakery-bash): sign, dollar bill, and empty-tray SVGs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — CSS + Scene Shell

### Task 3.1: Create `pixel-scene.css` with layout + keyframes

**Files:**
- Create: `games/bakery-bash/app/src/styles/pixel-scene.css`
- Modify: `games/bakery-bash/app/src/main.tsx`

- [ ] **Step 1: Check current main.tsx imports**

```bash
cat games/bakery-bash/app/src/main.tsx
```

Confirm `global.css` is imported so you know where to add the pixel-scene import.

- [ ] **Step 2: Create `pixel-scene.css`**

```css
/* Pixel Bakery Scene — used only inside SimulatePhase */

.pixel-scene {
  position: relative;
  width: 100%;
  max-width: 720px;
  aspect-ratio: 16 / 9;
  margin: 0 auto;
  background: #F4E4C1;
  overflow: hidden;
  border: 4px solid #5A3A20;
  border-radius: 4px;
  image-rendering: pixelated;
  image-rendering: crisp-edges; /* Safari fallback */
}

.pixel-scene__layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.pixel-scene__backwall { top: 0; height: 60%; }
.pixel-scene__floor    { top: 82%; height: 18%; }
.pixel-scene__counter  { top: 60%; height: 22%; }
.pixel-scene__door     { top: 46%; right: 0; width: 8%; height: 34%; }

.pixel-scene__backwall img,
.pixel-scene__floor img,
.pixel-scene__counter img,
.pixel-scene__door img {
  width: 100%;
  height: 100%;
  display: block;
}

.pixel-scene__sign {
  position: absolute;
  top: 6%;
  left: 50%;
  transform: translateX(-50%);
  width: 38%;
}

.pixel-scene__sign img {
  width: 100%;
  display: block;
}

.pixel-scene__sign-text {
  position: absolute;
  inset: 20% 8% 12% 8%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Courier New', monospace;
  font-weight: bold;
  color: #3B2A1A;
  text-shadow: 1px 1px 0 rgba(255,255,255,0.3);
  font-size: clamp(0.55rem, 1.6vw, 1rem);
  line-height: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Actor layer shared rules */
.pixel-actor {
  position: absolute;
  bottom: 18%;
  width: 32px;
  height: 48px;
  transform-origin: bottom center;
  will-change: transform;
}

.pixel-actor--customer {
  background-image: url('/assets/svg/characters/customer-walk-spritesheet.svg');
  background-size: 400% 100%; /* 4 frames wide */
  animation: pixel-walk 0.6s steps(4) infinite;
}

.pixel-actor--customer[data-facing='left']  { transform: scaleX(-1); }

@keyframes pixel-walk {
  from { background-position-x: 0%; }
  to   { background-position-x: -400%; }
}

.pixel-actor--chef {
  background-image: url('/assets/svg/characters/chef-walk-spritesheet.svg');
  background-size: 400% 100%;
  background-position-x: 0%; /* idle on first frame */
}

/* Dollar popup */
.pixel-dollar {
  position: absolute;
  width: 24px;
  height: 14px;
  pointer-events: none;
  animation: pixel-dollar-float 0.9s ease-out forwards;
}

@keyframes pixel-dollar-float {
  0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate(0, -48px) rotate(-10deg); opacity: 0; }
}

/* Day/night overlay */
.pixel-scene__nightveil {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(20, 22, 60, 0.35), rgba(20, 22, 60, 0.55));
  opacity: 0;
  transition: opacity 600ms ease;
  pointer-events: none;
}
.pixel-scene--night .pixel-scene__nightveil { opacity: 1; }

/* Ad display (back wall poster) */
.pixel-scene__ad {
  position: absolute;
  top: 12%;
  left: 5%;
  width: 14%;
  border: 3px solid #5A3A20;
  background: #FFF;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
}
.pixel-scene__ad img { width: 100%; height: 100%; display: block; }

/* Reduced-motion text */
.pixel-scene__rm-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Courier New', monospace;
  font-size: 1.25rem;
  color: #5A3A20;
  background: rgba(244, 228, 193, 0.6);
}

@media (prefers-reduced-motion: reduce) {
  .pixel-actor--customer { animation: none; }
  .pixel-dollar { animation: none; display: none; }
  .pixel-scene__nightveil { transition: none; }
}
```

- [ ] **Step 3: Import the stylesheet**

In `games/bakery-bash/app/src/main.tsx`, add the import near the other style imports:

```ts
import './styles/pixel-scene.css'
```

- [ ] **Step 4: Sanity check — build still works**

```bash
cd games/bakery-bash/app && npm run build
```

Expected: build completes without CSS errors.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/styles/pixel-scene.css \
        games/bakery-bash/app/src/main.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): add pixel-scene stylesheet with layout + keyframes

Scoped rules for the pixel scene — 16:9 stage, layer positioning,
walk-cycle and dollar-float keyframes, night veil, reduced-motion
overrides. Not wired into any component yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Presentational Components

These are pure, props-only components. No unit tests per component — the integration smoke test in Phase 6 covers rendering; complex logic stays in the hook (already tested).

### Task 4.1: `InteriorBackdrop`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/InteriorBackdrop.tsx`

- [ ] **Step 1: Write the component**

```tsx
export function InteriorBackdrop() {
  return (
    <>
      <div className="pixel-scene__layer pixel-scene__backwall">
        <img src="/assets/svg/scene/interior-backwall.svg" alt="" aria-hidden="true" />
      </div>
      <div className="pixel-scene__layer pixel-scene__counter">
        <img src="/assets/svg/scene/counter.svg" alt="" aria-hidden="true" />
      </div>
      <div className="pixel-scene__layer pixel-scene__floor">
        <img src="/assets/svg/scene/floor.svg" alt="" aria-hidden="true" />
      </div>
      <div className="pixel-scene__layer pixel-scene__door">
        <img src="/assets/svg/scene/door.svg" alt="" aria-hidden="true" />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify public-assets path**

The `app/public/` directory mirrors `/assets/...` at runtime. Check that the SVGs we created under `games/bakery-bash/assets/svg/scene/` are reachable. The repo uses a build script or symlink — look at existing references:

```bash
grep -rn "assets/svg/characters" games/bakery-bash/app/src --include="*.tsx" --include="*.ts" | head -5
```

If those references work, the same path convention applies here.

If `public/` does NOT mirror `assets/svg/scene/`, copy or symlink the new SVGs into `games/bakery-bash/app/public/assets/svg/scene/` so the paths resolve at runtime.

- [ ] **Step 3: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/InteriorBackdrop.tsx \
        games/bakery-bash/app/public/assets/svg/scene/ 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(bakery-bash): InteriorBackdrop — static layered scene

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.2: `TeamSign`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/TeamSign.tsx`

- [ ] **Step 1: Write the component**

```tsx
interface Props {
  teamName: string
}

export function TeamSign({ teamName }: Props) {
  const display = teamName.trim() || 'My Bakery'
  return (
    <div className="pixel-scene__sign" aria-hidden="true">
      <img src="/assets/svg/scene/wooden-sign.svg" alt="" />
      <div className="pixel-scene__sign-text" title={display}>
        {display}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/TeamSign.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): TeamSign renders team name on wooden plaque

Long names truncate with ellipsis; empty/whitespace name falls back to
"My Bakery".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.3: `ShelfStock`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/ShelfStock.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { ProductKey } from '../../types/game'

const SHELF_PRODUCTS: ProductKey[] = ['croissant', 'cookie', 'bagel', 'sandwich', 'coffee', 'matcha']

interface Props {
  soldOut: Set<ProductKey>
  menu: Partial<Record<ProductKey, boolean>>
}

export function ShelfStock({ soldOut, menu }: Props) {
  return (
    <div className="pixel-scene__shelves" aria-hidden="true">
      {SHELF_PRODUCTS.map((product, idx) => {
        const onMenu = menu[product] !== false
        const empty = !onMenu || soldOut.has(product)
        const row = Math.floor(idx / 3)     // 0 or 1
        const col = idx % 3
        const topPct = 12 + row * 14        // 12% or 26%
        const leftPct = 38 + col * 15       // 38%, 53%, 68%
        return (
          <img
            key={product}
            src={
              empty
                ? '/assets/svg/scene/shelf-product-empty.svg'
                : `/assets/svg/products/${product}.svg`
            }
            alt=""
            style={{
              position: 'absolute',
              top: `${topPct}%`,
              left: `${leftPct}%`,
              width: '6%',
              imageRendering: 'pixelated',
            }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/ShelfStock.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): ShelfStock shows products on back-wall shelves

Swaps to empty-tray sprite when product is sold out or off-menu.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.4: `ChefRoster`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/ChefRoster.tsx`

Generic per-station fallback is acceptable per spec. Uses the existing `chef-walk-spritesheet.svg` pinned to idle column; per-chef nationality can be layered in later as polish.

- [ ] **Step 1: Write the component**

```tsx
import type { StaffCounts } from '../../types/game'

interface Props {
  staffCounts: StaffCounts
}

interface ChefSlot {
  station: 'bakery' | 'deli' | 'barista'
  xPct: number
}

// Three stations across the back of the counter zone
const STATIONS: ChefSlot[] = [
  { station: 'bakery',  xPct: 28 },
  { station: 'deli',    xPct: 50 },
  { station: 'barista', xPct: 72 },
]

export function ChefRoster({ staffCounts }: Props) {
  return (
    <div className="pixel-scene__chef-layer" aria-hidden="true">
      {STATIONS.map(({ station, xPct }) => {
        const count = station === 'bakery'
          ? staffCounts.bakerySousChefs
          : station === 'deli'
          ? staffCounts.deliSousChefs
          : staffCounts.baristaSousChefs
        if (count <= 0) return null
        return (
          <div
            key={station}
            className="pixel-actor pixel-actor--chef"
            style={{
              left: `calc(${xPct}% - 16px)`,
              bottom: '28%',
            }}
            data-station={station}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/ChefRoster.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): ChefRoster — up to 3 chef sprites at station positions

Uses generic per-station fallback from the existing chef spritesheet.
Individual chef variants (nationality/gender) are polish for a follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.5: `AdDisplay`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/AdDisplay.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { AdType } from '../../types/game'

const AD_ICONS: Record<string, string> = {
  TV: '/assets/ads/tv.svg',
  Radio: '/assets/ads/radio.svg',
  Newspaper: '/assets/ads/newspaper.svg',
  Billboard: '/assets/ads/billboard.svg',
}

interface Props {
  adWon: AdType | null | undefined
}

export function AdDisplay({ adWon }: Props) {
  if (!adWon || !AD_ICONS[adWon]) return null
  return (
    <div className="pixel-scene__ad" aria-hidden="true">
      <img src={AD_ICONS[adWon]} alt="" />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/AdDisplay.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): AdDisplay — reskin ad winner as back-wall poster

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.6: `DayNightOverlay`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/DayNightOverlay.tsx`

- [ ] **Step 1: Write the component**

```tsx
export function DayNightOverlay() {
  return <div className="pixel-scene__nightveil" aria-hidden="true" />
}
```

The parent scene adds `pixel-scene--night` when `isNight` is true; the veil's opacity transition handles the fade.

- [ ] **Step 2: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/DayNightOverlay.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): DayNightOverlay — purely CSS-driven night veil

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Animated Layers

### Task 5.1: `CustomerLayer`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/CustomerLayer.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { CustomerActor } from '../../hooks/useSceneAnimation'

interface Props {
  customers: CustomerActor[]
  sceneWidthLogical?: number
}

export function CustomerLayer({ customers, sceneWidthLogical = 480 }: Props) {
  return (
    <div className="pixel-scene__customer-layer" aria-hidden="true">
      {customers.map((c) => {
        const leftPct = (c.x / sceneWidthLogical) * 100
        const facing = c.phase === 'WALK_OUT' ? 'right' : 'left'
        return (
          <div
            key={c.id}
            className="pixel-actor pixel-actor--customer"
            data-facing={facing}
            data-phase={c.phase}
            data-variant={c.variantIdx}
            style={{
              left: `calc(${leftPct}% - 16px)`,
            }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/CustomerLayer.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): CustomerLayer renders actor positions from hook state

Flips sprite horizontally on WALK_OUT (leaving).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.2: `DollarLayer`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/DollarLayer.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { DollarPopup } from '../../hooks/useSceneAnimation'

interface Props {
  dollars: DollarPopup[]
  sceneWidthLogical?: number
}

export function DollarLayer({ dollars, sceneWidthLogical = 480 }: Props) {
  return (
    <div className="pixel-scene__dollar-layer" aria-hidden="true">
      {dollars.map((d) => {
        const leftPct = (d.x / sceneWidthLogical) * 100
        const topPct = (d.y / 270) * 100
        return (
          <img
            key={d.id}
            src="/assets/svg/scene/dollar-bill.svg"
            alt=""
            className="pixel-dollar"
            style={{
              left: `calc(${leftPct}% - 12px)`,
              top: `calc(${topPct}% - 7px)`,
            }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/DollarLayer.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): DollarLayer renders flurry popups from hook state

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Orchestrator + Integration

### Task 6.1: `PixelBakeryScene`

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/PixelBakeryScene.tsx`

- [ ] **Step 1: Write the orchestrator**

```tsx
import { useMemo } from 'react'
import { useGame } from '../../contexts/GameContext'
import { useSceneAnimation } from '../../hooks/useSceneAnimation'
import type { ProductKey } from '../../types/game'

import { InteriorBackdrop } from './InteriorBackdrop'
import { TeamSign } from './TeamSign'
import { ShelfStock } from './ShelfStock'
import { ChefRoster } from './ChefRoster'
import { AdDisplay } from './AdDisplay'
import { CustomerLayer } from './CustomerLayer'
import { DollarLayer } from './DollarLayer'
import { DayNightOverlay } from './DayNightOverlay'

const TOTAL_DAYS = 30
const DAY_DURATION_MS = 4000
const SIM_DURATION_MS = TOTAL_DAYS * DAY_DURATION_MS

interface Props {
  isNight: boolean
  soldOut: Set<ProductKey>
  reducedMotion: boolean
}

export function PixelBakeryScene({ isNight, soldOut, reducedMotion }: Props) {
  const { teamName, player, pendingDecision, roundResults } = useGame()
  const latest = roundResults[roundResults.length - 1]
  const customerCount = typeof latest?.customerCount === 'number' ? latest.customerCount : 0
  const adWon = latest?.auctionResults?.adWon ?? null
  const displayName = teamName ?? player?.bakeryName ?? 'My Bakery'

  const { customers, dollars } = useSceneAnimation({
    customerCount,
    simDurationMs: SIM_DURATION_MS,
    isNight,
    reducedMotion,
  })

  const menuMap = useMemo(() => pendingDecision.menu, [pendingDecision.menu])

  return (
    <div
      className={`pixel-scene${isNight ? ' pixel-scene--night' : ''}`}
      role="img"
      aria-label={`${displayName} bakery interior with customers making purchases`}
    >
      <InteriorBackdrop />
      <ShelfStock soldOut={soldOut} menu={menuMap} />
      <AdDisplay adWon={adWon} />
      <TeamSign teamName={displayName} />
      <ChefRoster staffCounts={pendingDecision.staffCounts} />
      <CustomerLayer customers={customers} />
      <DollarLayer dollars={dollars} />
      <DayNightOverlay />
      {reducedMotion && (
        <div className="pixel-scene__rm-text">Simulating round…</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Sanity build**

```bash
cd games/bakery-bash/app && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/PixelBakeryScene.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): PixelBakeryScene orchestrator wires hook + children

Reads customerCount / adWon / teamName / menu / staffCounts from useGame().
All mutable state lives in useSceneAnimation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6.2: Error boundary

**Files:**
- Create: `games/bakery-bash/app/src/components/simulate/SceneErrorBoundary.tsx`

- [ ] **Step 1: Write the boundary**

```tsx
import { Component, type ReactNode } from 'react'

interface Props {
  fallback: ReactNode
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('PixelBakeryScene crashed; falling back to emoji scene.', error)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add games/bakery-bash/app/src/components/simulate/SceneErrorBoundary.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): SceneErrorBoundary — fall back to emoji scene on crash

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6.3: Wire into `SimulatePhase`

**Files:**
- Modify: `games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx`

- [ ] **Step 1: Extract the existing emoji scene as a local fallback component**

At the top of `SimulatePhase.tsx`, add the fallback component and the new import. Place the fallback just above `export function SimulatePhase()`:

```tsx
import { PixelBakeryScene } from '../../components/simulate/PixelBakeryScene'
import { SceneErrorBoundary } from '../../components/simulate/SceneErrorBoundary'

function LegacyEmojiFallback({ adWon, isNight, reducedMotion }: {
  adWon: string | null | undefined
  isNight: boolean
  reducedMotion: boolean
}) {
  return (
    <>
      {adWon && AD_ICONS[adWon] && (
        <div className="simulate-phase__ad-display">
          <img src={AD_ICONS[adWon]} alt={`${adWon} ad`} className="simulate-phase__ad-icon" />
        </div>
      )}
      <div className="simulate-phase__storefront">
        <div className="simulate-phase__store-label">🥐 Your Bakery</div>
        {!isNight && !reducedMotion && (
          <div className="simulate-phase__customers">
            <span className="simulate-phase__customer">🚶</span>
            <span className="simulate-phase__customer simulate-phase__customer--2">🚶‍♀️</span>
          </div>
        )}
        {isNight && <div className="simulate-phase__night-label">🌙 Closed</div>}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Replace the inner content of `.simulate-phase__bakery-visual`**

Find:

```tsx
<div className="simulate-phase__bakery-visual">
  {adWon && AD_ICONS[adWon] && (
    <div className="simulate-phase__ad-display">
      ...
    </div>
  )}
  <div className="simulate-phase__storefront">
    ...
  </div>
</div>
```

Replace with:

```tsx
<div className="simulate-phase__bakery-visual">
  <SceneErrorBoundary
    fallback={
      <LegacyEmojiFallback
        adWon={adWon}
        isNight={isNight}
        reducedMotion={reducedMotion}
      />
    }
  >
    <PixelBakeryScene
      isNight={isNight}
      soldOut={soldOut}
      reducedMotion={reducedMotion}
    />
  </SceneErrorBoundary>
</div>
```

- [ ] **Step 3: Run tests**

```bash
cd games/bakery-bash/app && npm test
```

Expected: all existing + new tests pass.

- [ ] **Step 4: Sanity build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): swap SimulatePhase center visual for PixelBakeryScene

Keeps the emoji scene as the error-boundary fallback so any crash or
missing asset degrades gracefully without breaking the round transition.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7 — Integration Smoke Test

### Task 7.1: End-to-end smoke test for SimulatePhase

**Files:**
- Create: `games/bakery-bash/app/src/pages/phases/__tests__/SimulatePhase.test.tsx`

- [ ] **Step 1: Write the failing test**

`GameContext` is not exported from `contexts/GameContext.tsx` — only `useGame`, `useGameDispatch`, and `GameProvider` are. Mock the hook module directly:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

const baseGameState = {
  teamName: 'Bun Appétit',
  player: null,
  role: null,
  currentRound: 1,
  totalRounds: 5,
  pendingDecision: {
    menu: { croissant: true, cookie: true, bagel: true, sandwich: true, coffee: true, matcha: true },
    quantities: {},
    productPrices: {},
    staffCounts: { bakerySousChefs: 1, deliSousChefs: 1, baristaSousChefs: 1 },
  },
  roundResults: [{
    round: 1,
    revenue: 1200,
    customerCount: 40,
    customerSatisfaction: 75,
    auctionResults: { adWon: null, chefWon: null },
  }],
  maintenanceBars: { cleanliness: 100, ovenHealth: 100 },
}

let mockGameState: typeof baseGameState = baseGameState

vi.mock('../../../contexts/GameContext', () => ({
  useGame: () => mockGameState,
  useGameDispatch: () => vi.fn(),
}))

import { SimulatePhase } from '../SimulatePhase'

describe('SimulatePhase with PixelBakeryScene', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGameState = baseGameState
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the team name and spawns at least one customer after 4s', () => {
    render(<SimulatePhase />)

    expect(screen.getByText('Bun Appétit')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })

    const customers = document.querySelectorAll('.pixel-actor--customer')
    expect(customers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders no customers when customerCount is 0', () => {
    mockGameState = {
      ...baseGameState,
      roundResults: [{
        round: 1, revenue: 0, customerCount: 0, customerSatisfaction: 0,
        auctionResults: { adWon: null, chefWon: null },
      }],
    }

    render(<SimulatePhase />)

    act(() => {
      vi.advanceTimersByTime(8000)
    })
    expect(document.querySelectorAll('.pixel-actor--customer').length).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test — expect PASS**

```bash
cd games/bakery-bash/app && npm test -- SimulatePhase.test
```

If an imported dependency of `SimulatePhase` requires extra mocking (e.g., a `firebase/firestore` listener), extend the `vi.mock` calls accordingly until PASS.

- [ ] **Step 3: Commit**

```bash
git add games/bakery-bash/app/src/pages/phases/__tests__/SimulatePhase.test.tsx
git commit -m "$(cat <<'EOF'
test(bakery-bash): integration smoke for SimulatePhase + PixelBakeryScene

Renders the team name; spawns customers for non-zero customerCount;
stays empty when customerCount is 0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8 — Side-Panel Pixel Reskin

Per design decision 3, the side panels (Menu left, Status right) get a pixel/wood reskin for visual cohesion — structure unchanged.

### Task 8.1: Reskin Menu + Status panels

**Files:**
- Modify: `games/bakery-bash/app/src/styles/pixel-scene.css`
- Modify: `games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx` (add CSS class toggle)

- [ ] **Step 1: Add reskin rules to pixel-scene.css**

Append:

```css
/* Pixel reskin for SimulatePhase side panels — opt-in via wrapping class */
.simulate-phase--pixel .simulate-phase__menu-panel,
.simulate-phase--pixel .simulate-phase__status-panel {
  background: #F4E4C1;
  border: 4px solid #5A3A20;
  border-radius: 4px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
}

.simulate-phase--pixel .simulate-phase__panel-title {
  font-family: 'Courier New', monospace;
  font-weight: bold;
  color: #3B2A1A;
  background: #B8865C;
  padding: 0.3rem 0.6rem;
  margin: -0.25rem -0.25rem 0.5rem -0.25rem;
  border-bottom: 3px solid #5A3A20;
}

.simulate-phase--pixel .simulate-phase__menu-item {
  border-bottom: 2px solid #D7AE85;
  padding: 0.4rem 0.3rem;
}

.simulate-phase--pixel .simulate-phase__menu-item--soldout {
  opacity: 0.5;
  text-decoration: line-through;
}

.simulate-phase--pixel .simulate-phase__sold-out-badge {
  background: #8B2F2F;
  color: #FFFFFF;
  font-family: 'Courier New', monospace;
  padding: 0.1rem 0.3rem;
  border-radius: 2px;
}

.simulate-phase--pixel .simulate-phase__bar-track {
  background: #5A3A20;
  border: 2px solid #3B2A1A;
  border-radius: 2px;
  overflow: hidden;
}

.simulate-phase--pixel .simulate-phase__bar-fill {
  transition: width 400ms ease;
}
```

- [ ] **Step 2: Add the wrapping class to `SimulatePhase`**

In the root `<section>` of `SimulatePhase`:

```tsx
<section className={`simulate-phase simulate-phase--pixel ${isNight ? "simulate-phase--night" : "simulate-phase--day"}`}>
```

- [ ] **Step 3: Sanity build**

```bash
cd games/bakery-bash/app && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add games/bakery-bash/app/src/styles/pixel-scene.css \
        games/bakery-bash/app/src/pages/phases/SimulatePhase.tsx
git commit -m "$(cat <<'EOF'
feat(bakery-bash): pixel reskin for SimulatePhase side panels

Opt-in via simulate-phase--pixel wrapper class. Menu + Status get a
wood-framed pixel look; structure is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9 — Manual QA + Polish

No TDD here — these are human-eye checks. Document outcomes in a `docs/bakery-bash/pixel-sim-qa.md` if anything needs follow-up.

### Task 9.1: Manual QA sweep

- [ ] **Step 1: Run the dev server**

```bash
cd games/bakery-bash/app && npm run dev
```

- [ ] **Step 2: Walk through the scene in 3 contexts**

Trigger a round advance in the Firebase emulator (or use the dev nav) and observe:

  - **Low customerCount** (~10–20): scene is sparse, dollars trickle, shelves mostly stocked
  - **Mid customerCount** (~60–80): steady flow, coins burst every ~1.5s, shelves drain mid-loop
  - **High customerCount** (200+): visible queue at counter, near-constant dollar flurry

- [ ] **Step 3: Verify day/night and reduced-motion**

  - Watch a full 30-day loop; confirm night veil fades in every other beat
  - In OS settings, enable "Reduce Motion"; reload the page — confirm "Simulating round…" replaces the actors

- [ ] **Step 4: Verify cross-browser**

Open in Chrome, Safari, Firefox — confirm `image-rendering` keeps sprite edges crisp in all three.

- [ ] **Step 5: Verify error-boundary fallback**

Temporarily break an asset path in `PixelBakeryScene.tsx` (e.g., rename `interior-backwall.svg` reference). Reload — confirm the emoji fallback renders instead of a white screen. Revert.

- [ ] **Step 6: Document + commit any fixes found**

If the sweep uncovers issues, create small follow-up commits per issue. Otherwise this task is verify-only, no commit needed.

### Task 9.2: Final test suite + lint

- [ ] **Step 1: Run all tests**

```bash
cd games/bakery-bash/app && npm test
```

Expected: all green.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no new warnings.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: (If anything failed) fix and commit**

Fix each issue as its own small commit. Re-run until green.

---

## Done

Final deliverable:
- Pixel interior scene replaces the emoji center visual in `SimulatePhase`
- Team name on wooden sign, chefs behind counter, customers walking in + buying + leaving, dollar flurries on every sale
- Day/night veil, sold-out shelves, reskinned ad poster on back wall, side-panel pixel reskin, reduced-motion fallback, error-boundary fallback to the emoji scene
- Test suite: 10+ unit tests on `useSceneAnimation` + 2 integration smokes on `SimulatePhase`
- No backend or schema changes

Open a PR from `feat/pixel-bakery-simulation-spec` (or a successor branch) against `main`.
