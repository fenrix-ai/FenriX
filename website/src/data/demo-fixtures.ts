export type DemoPlayer = {
  id: string
  handle: string
  bakery: string
  cash: number
  status: 'ready' | 'thinking' | 'submitted'
}

export const demoPlayers: DemoPlayer[] = [
  { id: 'p1', handle: 'sofia_v',   bakery: 'Crumb Theory',     cash: 12450, status: 'submitted' },
  { id: 'p2', handle: 'kavin.r',   bakery: 'Knead Speed',      cash: 11210, status: 'submitted' },
  { id: 'p3', handle: 'dyl.b',     bakery: 'Dough Joneses',    cash: 10870, status: 'thinking' },
  { id: 'p4', handle: 'mia.t',     bakery: 'Truffle in Mind',  cash: 10520, status: 'submitted' },
  { id: 'p5', handle: 'scott.s',   bakery: 'Loaf, Actually',   cash:  9870, status: 'ready' },
  { id: 'p6', handle: 'katrina.m', bakery: 'Rye Society',      cash:  9540, status: 'thinking' },
  { id: 'p7', handle: 'dyl.m',     bakery: 'Bread & Beyond',   cash:  9120, status: 'submitted' },
  { id: 'p8', handle: 'house',     bakery: 'Brioche Direct',   cash:  8210, status: 'ready' }
]

export type DemoLeader = {
  rank: number
  player: string
  bakery: string
  netProfit: number
  rounds: number
}

export const demoLeaderboard: DemoLeader[] = [
  { rank: 1, player: 'sofia_v',   bakery: 'Crumb Theory',    netProfit:  4870, rounds: 5 },
  { rank: 2, player: 'kavin.r',   bakery: 'Knead Speed',     netProfit:  4210, rounds: 5 },
  { rank: 3, player: 'mia.t',     bakery: 'Truffle in Mind', netProfit:  3540, rounds: 5 },
  { rank: 4, player: 'dyl.b',     bakery: 'Dough Joneses',   netProfit:  3120, rounds: 5 },
  { rank: 5, player: 'dyl.m',     bakery: 'Bread & Beyond',  netProfit:  2880, rounds: 5 },
  { rank: 6, player: 'katrina.m', bakery: 'Rye Society',     netProfit:  1940, rounds: 5 },
  { rank: 7, player: 'scott.s',   bakery: 'Loaf, Actually',  netProfit:  1610, rounds: 5 },
  { rank: 8, player: 'house',     bakery: 'Brioche Direct',  netProfit:  -250, rounds: 5 }
]

export type WaterfallStep = { label: string; value: number }
export const demoWaterfall: WaterfallStep[] = [
  { label: 'Revenue',      value:  5400 },
  { label: 'COGS',         value: -2100 },
  { label: 'Wages',        value:  -900 },
  { label: 'Ad spend',     value:  -650 },
  { label: 'Rent',         value:  -400 },
  { label: 'Net profit',   value:  1350 }
]
