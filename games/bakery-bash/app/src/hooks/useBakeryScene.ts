import { useEffect, useRef, useState } from 'react'
import { SCENE, type StationKey } from '../components/bakery-scene/scene-geometry'
import type { BakerySceneMode } from '../components/bakery-scene/PixelBakeryScene'

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

export interface UseBakerySceneProps {
  mode: BakerySceneMode
  teamName: string
  staffCounts: Record<StationKey, number>
  customerCount: number
}

export interface UseBakerySceneResult {
  chefs: Chef[]
}

const CHEF_BOB_MS = 400 // full cycle (frames 0→1→0)

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
    const baseX = SCENE.stations[a.station]
    const offset = (a.index - 0.5) * 24
    return {
      id: `${a.station}-${a.index}`,
      station: a.station,
      x: Math.round(baseX + (a.index === 0 && staffCounts[a.station] === 1 ? 0 : offset)),
      y: SCENE.chefTopY,
      frame: 0,
    }
  })
}

export function useBakeryScene(props: UseBakerySceneProps): UseBakerySceneResult {
  const { staffCounts } = props
  const [bobFrame, setBobFrame] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    const loop = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const nextFrame = Math.floor((elapsed % CHEF_BOB_MS) / (CHEF_BOB_MS / 2)) % 2
      setBobFrame(nextFrame)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const chefs = computeChefs(staffCounts).map((c) => ({ ...c, frame: bobFrame }))

  return { chefs }
}
