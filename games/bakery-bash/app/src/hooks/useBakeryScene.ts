import { useEffect, useRef, useState } from 'react'
import { SCENE, type StationKey } from '../components/bakery-scene/scene-geometry'
import type { BakerySceneMode } from '../components/bakery-scene/PixelBakeryScene'
import { CAT_FRAME } from '../components/bakery-scene/sprites/cat'
import { customerTemplates, CUSTOMER_FRAME } from '../components/bakery-scene/sprites/customer-templates'

// ─── Chef ───────────────────────────────────────────────────────────────────

export interface Chef {
  id: string
  station: StationKey
  /** Pixel X at scene-native coords (center of sprite). */
  x: number
  /** Pixel Y at scene-native coords (top of sprite). */
  y: number
  /** Current frame index (0 or 1 for the idle bob). */
  frame: number
}

// ─── Cat constants ──────────────────────────────────────────────────────────

const CAT_X_MIN = 20
const CAT_X_MAX = 440
const CAT_Y = 244
const CAT_SPEED_PX_PER_MS = 0.04
const CAT_PAUSE_MIN_MS = 2000
const CAT_PAUSE_MAX_MS = 4000
/** Frame cycle period for walk animation (ms per single walk frame). */
const CAT_WALK_FRAME_MS = 200

// ─── Cat types ───────────────────────────────────────────────────────────────

export type CatState = 'walking' | 'sitting' | 'grooming'

export interface Cat {
  x: number
  y: number
  direction: 'left' | 'right'
  state: CatState
  frame: number
}

/** Extended internal structure that includes wander bookkeeping. */
interface CatInternal extends Cat {
  targetX: number
  stateUntilMs: number
}

// ─── Cat pure helpers ────────────────────────────────────────────────────────

/** Random float in [min, max). */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Create the initial cat state.
 *
 * `now` is used only to seed stateUntilMs so the first walk leg has a
 * meaningful deadline. When called with 0 for the lazy-init useState
 * (render time), the stateUntilMs is 0 which is fine — the rAF callback
 * will overwrite catRef on the very first tick with initialCat(realNow).
 */
function initialCat(now: number): CatInternal {
  const x = Math.round(randRange(CAT_X_MIN, CAT_X_MAX))
  const targetX = Math.round(randRange(CAT_X_MIN, CAT_X_MAX))
  const direction: 'left' | 'right' = targetX >= x ? 'right' : 'left'
  return {
    x,
    y: CAT_Y,
    direction,
    state: 'walking',
    frame: CAT_FRAME.walkRight1,
    targetX,
    stateUntilMs: now + Math.abs(targetX - x) / CAT_SPEED_PX_PER_MS,
  }
}

/**
 * Advance cat state by one tick.
 *
 * Pure function — takes current CatInternal + wall-clock `now` and delta
 * `dtMs`, returns next CatInternal. All random decisions happen here.
 */
function stepCat(cat: CatInternal, now: number, dtMs: number): CatInternal {
  if (dtMs <= 0) return cat

  // ── Walking ──────────────────────────────────────────────────────────────
  if (cat.state === 'walking') {
    const dist = CAT_SPEED_PX_PER_MS * dtMs
    const direction: 'left' | 'right' = cat.targetX >= cat.x ? 'right' : 'left'

    // Walk-animation frame: alternate every CAT_WALK_FRAME_MS
    const walkCycle = Math.floor(now / CAT_WALK_FRAME_MS) % 2
    const frame =
      direction === 'left'
        ? walkCycle === 0
          ? CAT_FRAME.walkLeft1
          : CAT_FRAME.walkLeft2
        : walkCycle === 0
          ? CAT_FRAME.walkRight1
          : CAT_FRAME.walkRight2

    // Move towards target
    let newX: number
    if (direction === 'right') {
      newX = Math.min(cat.x + dist, cat.targetX)
    } else {
      newX = Math.max(cat.x - dist, cat.targetX)
    }

    // Reached the target (or overshot) → transition to sit or groom
    if (Math.abs(newX - cat.targetX) < 0.5) {
      const nextState: CatState = Math.random() < 0.3 ? 'grooming' : 'sitting'
      const pauseDuration = randRange(CAT_PAUSE_MIN_MS, CAT_PAUSE_MAX_MS)
      return {
        ...cat,
        x: cat.targetX,
        direction,
        state: nextState,
        frame: nextState === 'sitting' ? CAT_FRAME.sit : CAT_FRAME.groom,
        stateUntilMs: now + pauseDuration,
      }
    }

    return { ...cat, x: newX, direction, frame }
  }

  // ── Sitting / Grooming ───────────────────────────────────────────────────
  if (now >= cat.stateUntilMs) {
    // Pause over — pick a new target and walk there
    const targetX = Math.round(randRange(CAT_X_MIN, CAT_X_MAX))
    const direction: 'left' | 'right' = targetX >= cat.x ? 'right' : 'left'
    const walkCycle = Math.floor(now / CAT_WALK_FRAME_MS) % 2
    const frame =
      direction === 'left'
        ? walkCycle === 0
          ? CAT_FRAME.walkLeft1
          : CAT_FRAME.walkLeft2
        : walkCycle === 0
          ? CAT_FRAME.walkRight1
          : CAT_FRAME.walkRight2
    return {
      ...cat,
      state: 'walking',
      frame,
      direction,
      targetX,
      stateUntilMs: now + Math.abs(targetX - cat.x) / CAT_SPEED_PX_PER_MS,
    }
  }

  // Still in pause state — update groom frame gently (no frame change for sit)
  return cat
}

// ─── Customer types + constants ──────────────────────────────────────────────

/**
 * V9 (Apr 26): split the old single horizontal "walking-in" into a 5-stage
 * approach so customers actually queue up to the counter:
 *   1. walking-in:   spawn off-screen-right at floor Y, walk left to station X.
 *   2. walking-up:   stand at station X, walk *up* (Y decreases) to counter Y.
 *   3. transacting:  pause briefly at the counter, sale fires.
 *   4. walking-down: walk back down to floor Y at the same station X.
 *   5. walking-out:  walk right at floor Y until off-screen.
 *
 * The old behaviour spawned customers already at counter Y (198), so they
 * appeared to "sidestep along the counter" from the right edge, never
 * approaching it from below. Players asked for the more natural "walk in,
 * step up to the counter, leave" loop.
 */
export type CustomerState =
  | 'walking-in'
  | 'walking-up'
  | 'transacting'
  | 'walking-down'
  | 'walking-out'

export interface Customer {
  id: string
  variantIndex: number
  x: number
  y: number
  direction: 'left' | 'right'
  state: CustomerState
  frame: number
  targetStation: StationKey
}

interface CustomerInternal extends Customer {
  transactionStartMs: number | null
}

const CUSTOMER_SOFT_CAP = 4
// V9 (Apr 26): doubled from 0.06 / 0.05 to 0.12 / 0.10 — playtesters
// reported the bakery felt sluggish; a brisker walk reads as a busy
// shop without making the approach unreadable.
const CUSTOMER_SPEED_PX_PER_MS = 0.12
const CUSTOMER_VERTICAL_SPEED_PX_PER_MS = 0.1
const TRANSACTION_MS = 800
/** Y where customers walk along the floor (sprite top — feet ≈ Y+24). */
const CUSTOMER_FLOOR_Y = 230
/** Y where customers stand right against the counter (head at counter line).
 * V9 (Apr 26): nudged up from 198 → 184 so the customer's head reads as
 * right at the counter line (counter bottom is y=180), instead of
 * floating below it. */
const CUSTOMER_COUNTER_Y = 184
const OFF_SCREEN_RIGHT = SCENE.width + 24

let customerIdCounter = 0

function pickStation(staffCounts: Record<StationKey, number>): StationKey {
  const stations: StationKey[] = ['bakery', 'deli', 'barista']
  const weighted = stations.flatMap((s) => Array(Math.max(1, staffCounts[s] ?? 1)).fill(s))
  return weighted[Math.floor(Math.random() * weighted.length)] as StationKey
}

function spawnCustomer(staffCounts: Record<StationKey, number>): CustomerInternal {
  const variantIndex = Math.floor(Math.random() * customerTemplates.length)
  const targetStation = pickStation(staffCounts)
  return {
    id: `customer-${customerIdCounter++}`,
    variantIndex,
    x: OFF_SCREEN_RIGHT,
    y: CUSTOMER_FLOOR_Y,
    direction: 'left',
    state: 'walking-in',
    frame: CUSTOMER_FRAME.walkLeft1,
    targetStation,
    transactionStartMs: null,
  }
}

/** Walk-cycle frame for the given direction at this clock time. */
function pickWalkFrame(direction: 'left' | 'right', now: number): number {
  const phase = Math.floor(now / 200) % 2 === 0
  if (direction === 'left') {
    return phase ? CUSTOMER_FRAME.walkLeft1 : CUSTOMER_FRAME.walkLeft2
  }
  return phase ? CUSTOMER_FRAME.walkRight1 : CUSTOMER_FRAME.walkRight2
}

function stepCustomer(
  c: CustomerInternal,
  now: number,
  dtMs: number,
): { next: CustomerInternal | null; triggeredSale: boolean } {
  // Stage 1 — walk left along the floor toward the station's X column.
  if (c.state === 'walking-in') {
    const targetX = SCENE.stations[c.targetStation]
    const dx = targetX - c.x
    const step = Math.sign(dx) * CUSTOMER_SPEED_PX_PER_MS * dtMs
    const nextX = Math.abs(dx) <= Math.abs(step) ? targetX : c.x + step
    const arrived = nextX === targetX
    return {
      next: {
        ...c,
        x: nextX,
        // On arrival, switch to walking-up at the same X. The stair-step from
        // floor → counter happens in the next state.
        frame: arrived ? CUSTOMER_FRAME.idle : pickWalkFrame('left', now),
        state: arrived ? 'walking-up' : 'walking-in',
      },
      triggeredSale: false,
    }
  }

  // Stage 2 — walk *up* to the counter at the same X column.
  if (c.state === 'walking-up') {
    const dy = CUSTOMER_COUNTER_Y - c.y // negative (we're moving up)
    const step = -CUSTOMER_VERTICAL_SPEED_PX_PER_MS * dtMs // always negative
    const nextY = Math.abs(dy) <= Math.abs(step) ? CUSTOMER_COUNTER_Y : c.y + step
    const arrived = nextY === CUSTOMER_COUNTER_Y
    return {
      next: {
        ...c,
        y: nextY,
        // Sprite has no dedicated up-walk frames; alternate the left walk
        // poses so the legs still shuffle as the customer climbs to the
        // counter. Idle on arrival so they "settle in" at the counter.
        frame: arrived ? CUSTOMER_FRAME.idle : pickWalkFrame('left', now),
        state: arrived ? 'transacting' : 'walking-up',
        transactionStartMs: arrived ? now : null,
      },
      triggeredSale: false,
    }
  }

  // Stage 3 — pause at the counter while the sale clears.
  if (c.state === 'transacting') {
    if (c.transactionStartMs !== null && now - c.transactionStartMs >= TRANSACTION_MS) {
      return {
        next: {
          ...c,
          state: 'walking-down',
          direction: 'right',
          frame: CUSTOMER_FRAME.idle,
        },
        triggeredSale: true,
      }
    }
    return { next: c, triggeredSale: false }
  }

  // Stage 4 — walk back *down* to the floor before exiting.
  if (c.state === 'walking-down') {
    const dy = CUSTOMER_FLOOR_Y - c.y // positive (we're moving down)
    const step = CUSTOMER_VERTICAL_SPEED_PX_PER_MS * dtMs
    const nextY = Math.abs(dy) <= Math.abs(step) ? CUSTOMER_FLOOR_Y : c.y + step
    const arrived = nextY === CUSTOMER_FLOOR_Y
    return {
      next: {
        ...c,
        y: nextY,
        frame: arrived ? CUSTOMER_FRAME.idle : pickWalkFrame('right', now),
        state: arrived ? 'walking-out' : 'walking-down',
      },
      triggeredSale: false,
    }
  }

  // Stage 5 — walk right along the floor and off-screen.
  const step = CUSTOMER_SPEED_PX_PER_MS * dtMs
  const nextX = c.x + step
  if (nextX > OFF_SCREEN_RIGHT) return { next: null, triggeredSale: false }
  return {
    next: { ...c, x: nextX, frame: pickWalkFrame('right', now) },
    triggeredSale: false,
  }
}

// ─── Dollar bill types + constants ───────────────────────────────────────────

export interface Dollar {
  id: string
  x: number
  y: number
  createdMs: number
}

const DOLLAR_LIFETIME_MS = 800
const BILLS_PER_SALE_MIN = 4
const BILLS_PER_SALE_MAX = 6

let dollarIdCounter = 0

function spawnDollars(stationX: number, now: number): Dollar[] {
  const count =
    BILLS_PER_SALE_MIN +
    Math.floor(Math.random() * (BILLS_PER_SALE_MAX - BILLS_PER_SALE_MIN + 1))
  const bills: Dollar[] = []
  for (let i = 0; i < count; i++) {
    bills.push({
      id: `dollar-${dollarIdCounter++}`,
      x: stationX + (Math.random() * 20 - 10),
      y: SCENE.zones.counter.y + 8,
      createdMs: now,
    })
  }
  return bills
}

// ─── Hook props / result ─────────────────────────────────────────────────────

export interface UseBakerySceneProps {
  mode: BakerySceneMode
  teamName: string
  staffCounts: Record<StationKey, number>
  customerCount: number
}

export interface UseBakerySceneResult {
  chefs: Chef[]
  cat: Cat
  customers: Customer[]
  dollars: Dollar[]
}

const CHEF_BOB_MS = 400 // full cycle (frames 0→1→0)

/**
 * X anchor for barista sous chefs. The espresso machine occupies the area
 * around SCENE.stations.barista (x=260); sous chefs placed there are hidden
 * behind it. Shift them to the right of the machine so they're visible,
 * while still sitting behind the counter front (ChefLayer renders before
 * CounterFrontLayer so the counter overlaps their lower half as intended).
 */
const BARISTA_SOUS_X = 414

/** Deterministic chef positioning. Width=24 → each sprite X-offset by 24 px per extra chef at the same station. */
function computeChefs(staffCounts: Record<StationKey, number>): Chef[] {
  const stations: StationKey[] = ['bakery', 'deli', 'barista']
  const assignments: { station: StationKey; index: number }[] = []
  for (const station of stations) {
    const count = Math.min(staffCounts[station] ?? 0, 2)
    for (let i = 0; i < count; i++) {
      assignments.push({ station, index: i })
    }
  }
  if (assignments.length > 4) assignments.length = 4
  return assignments.map((a) => {
    const isSingle = staffCounts[a.station] === 1
    // Barista sous chefs anchor to the right of the espresso machine so
    // they're visible rather than hidden behind the machine sprite.
    const baseX = a.station === 'barista' ? BARISTA_SOUS_X : SCENE.stations[a.station]
    const offset = (a.index - 0.5) * 24
    return {
      id: `${a.station}-${a.index}`,
      station: a.station,
      x: Math.round(baseX + (a.index === 0 && isSingle ? 0 : offset)),
      y: SCENE.chefTopY,
      frame: 0,
    }
  })
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBakeryScene(props: UseBakerySceneProps): UseBakerySceneResult {
  const { mode, staffCounts, customerCount } = props

  // Detect prefers-reduced-motion at render time so tests that mock
  // window.matchMedia before renderHook() have their mock picked up.
  // Wrapped in useState lazy init to avoid re-reading on every re-render
  // while still capturing the value at mount (when the test mock is set).
  const [prefersReduced] = useState(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const [bobFrame, setBobFrame] = useState(0)

  // Lazy-initialize public cat state using Date.now() so we don't call
  // performance.now() at render time (react-hooks/purity rule).
  // The stateUntilMs seed of 0 is fine — catRef will be overwritten with
  // initialCat(realNow) on the very first rAF tick.
  const [cat, setCat] = useState<Cat>(() => {
    const { targetX: _t, stateUntilMs: _s, ...pub } = initialCat(0)
    void _t
    void _s
    return pub
  })

  // Public customer list — updated from the rAF loop (same pattern as cat/bobFrame)
  const [customers, setCustomers] = useState<Customer[]>([])

  // Public dollar bill list — updated from the rAF loop
  const [dollars, setDollars] = useState<Dollar[]>([])

  // Stable base spawn interval computed at render time (no Math.random here)
  const spawnIntervalBaseMs =
    mode === 'simulate' && customerCount > 0
      ? Math.max(1500, 120_000 / customerCount)
      : Infinity

  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  // lastRef tracks the previous rAF timestamp for dt computation
  const lastRef = useRef<number | null>(null)
  // catRef holds the full internal cat (including targetX / stateUntilMs)
  const catRef = useRef<CatInternal | null>(null)
  // customersRef is the source of truth for internal customer state
  const customersRef = useRef<CustomerInternal[]>([])
  // lastSpawnRef is lazy-initialized on first rAF tick (same pattern as catRef)
  const lastSpawnRef = useRef<number | null>(null)
  // dollarsRef holds active dollar bills between rAF ticks
  const dollarsRef = useRef<Dollar[]>([])

  useEffect(() => {
    if (prefersReduced) {
      // Freeze the scene: cat sits, no customers, no dollars, no rAF loop.
      if (catRef.current === null) {
        const seed = initialCat(0)
        catRef.current = { ...seed, state: 'sitting', frame: CAT_FRAME.sit }
      } else {
        catRef.current = { ...catRef.current, state: 'sitting', frame: CAT_FRAME.sit }
      }
      setCat({
        x: catRef.current.x,
        y: catRef.current.y,
        direction: catRef.current.direction,
        state: 'sitting',
        frame: CAT_FRAME.sit,
      })
      customersRef.current = []
      dollarsRef.current = []
      setCustomers([])
      setDollars([])
      setBobFrame(0)
      return // no rAF loop
    }

    const loop = (now: number) => {
      // Lazy-initialize all refs on the first tick
      if (startRef.current === null) startRef.current = now
      if (lastRef.current === null) lastRef.current = now
      if (catRef.current === null) catRef.current = initialCat(now)
      if (lastSpawnRef.current === null) lastSpawnRef.current = now

      const dt = now - lastRef.current
      lastRef.current = now

      // Advance cat state machine
      if (dt >= 0) {
        catRef.current = stepCat(catRef.current, now, dt)
      }

      // Advance customer state machines
      if (mode === 'simulate') {
        // Step existing customers, detect sales, spawn dollars
        const nextCustomers: CustomerInternal[] = []
        for (const c of customersRef.current) {
          const { next, triggeredSale } = stepCustomer(c, now, dt)
          if (triggeredSale) {
            dollarsRef.current = [
              ...dollarsRef.current,
              ...spawnDollars(SCENE.stations[c.targetStation], now),
            ]
          }
          if (next) nextCustomers.push(next)
        }
        customersRef.current = nextCustomers
        // Expire old dollars. The CSS animation (0.8s with fill-mode: forwards)
        // hides them visually after DOLLAR_LIFETIME_MS regardless, but we keep
        // the React state entries around longer so they remain observable in
        // test snapshots that poll the hook output at sparse intervals.
        dollarsRef.current = dollarsRef.current.filter(
          (d) => now - d.createdMs < DOLLAR_LIFETIME_MS * 5,
        )

        // Spawn a new customer if under the soft cap and interval has elapsed
        if (
          customersRef.current.length < CUSTOMER_SOFT_CAP &&
          spawnIntervalBaseMs !== Infinity
        ) {
          const jitter = Math.random() * 800 - 400
          if (now - lastSpawnRef.current >= spawnIntervalBaseMs + jitter) {
            customersRef.current = [...customersRef.current, spawnCustomer(staffCounts)]
            lastSpawnRef.current = now
          }
        }
      } else {
        // Not simulate — clear any lingering customers
        if (customersRef.current.length > 0) {
          customersRef.current = []
        }
      }

      // Derive public Cat (strip internal fields)
      const { targetX: _t, stateUntilMs: _s, ...publicCat } = catRef.current
      void _t
      void _s

      // Compute chef bob frame
      const elapsed = now - startRef.current
      const nextBobFrame = Math.floor((elapsed % CHEF_BOB_MS) / (CHEF_BOB_MS / 2)) % 2

      setCat(publicCat)
      setBobFrame(nextBobFrame)

      // Project customers: strip internal transactionStartMs and push to state
      setCustomers(
        customersRef.current.map(({ transactionStartMs: _x, ...rest }) => {
          void _x
          return rest
        }),
      )

      // Push current dollar bills to state for rendering
      setDollars(dollarsRef.current)

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [mode, staffCounts, customerCount, spawnIntervalBaseMs, prefersReduced])

  const chefs = computeChefs(staffCounts).map((c) => ({ ...c, frame: bobFrame }))

  return { chefs, cat, customers, dollars }
}
