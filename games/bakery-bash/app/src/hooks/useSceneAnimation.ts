import { useEffect, useState } from 'react'

const JITTER = 0.25
const MAX_CUSTOMERS = 12

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
