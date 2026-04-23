import { useEffect, useState } from 'react'

const JITTER = 0.25
const MAX_CUSTOMERS = 12
const WALK_SPEED_PX_PER_SEC = 60
const AT_COUNTER_MIN_MS = 600
const AT_COUNTER_MAX_MS = 900
const EXIT_X = 500
const TICK_MS = 1000 / 30 // 30 Hz position update
const DOLLAR_LIFETIME_MS = 900
const FLURRY_MIN = 4
const FLURRY_MAX = 6
const COUNTER_Y = 110

function nextSpawnDelay(base: number) {
  const low = base * (1 - JITTER)
  const high = base * (1 + JITTER)
  return low + Math.random() * (high - low)
}

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
    // Deterministic dwell derived from phaseStart so tests are stable.
    const dwellFraction = Math.abs(Math.sin(c.phaseStart)) || 0.5
    const dwell =
      AT_COUNTER_MIN_MS + (AT_COUNTER_MAX_MS - AT_COUNTER_MIN_MS) * dwellFraction
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
              phase: 'WALK_IN' as const,
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
      const count =
        FLURRY_MIN + Math.floor(Math.random() * (FLURRY_MAX - FLURRY_MIN + 1))
      const born = performance.now()
      const fresh: DollarPopup[] = []
      for (let i = 0; i < count; i++) {
        const id = `d${nextDollarId++}`
        fresh.push({
          id,
          x: x + (Math.random() * 16 - 8),
          y: COUNTER_Y,
          bornAt: born,
        })
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
