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
