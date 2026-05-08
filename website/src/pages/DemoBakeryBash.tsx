import { DemoShell } from '../components/demo/DemoShell'
import { LobbyScreen } from '../components/demo/LobbyScreen'
import { StrategyScreen } from '../components/demo/StrategyScreen'
import { ResultsScreen } from '../components/demo/ResultsScreen'
import { LeaderboardScreen } from '../components/demo/LeaderboardScreen'

export function DemoBakeryBash() {
  return (
    <DemoShell
      screens={{
        lobby:       <LobbyScreen />,
        strategy:    <StrategyScreen />,
        results:     <ResultsScreen />,
        leaderboard: <LeaderboardScreen />
      }}
    />
  )
}
