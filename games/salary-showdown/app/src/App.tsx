import { Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { ProfessorProvider } from './contexts/ProfessorContext';
import { RoundPresentationProvider } from './contexts/RoundPresentationContext';
import { PhaseRouter } from './components/PhaseRouter';
import LandingPage from './pages/LandingPage';
import LobbyPage from './pages/LobbyPage';
import FrontOfficePage from './pages/FrontOfficePage';
import FreeAgencyPage from './pages/FreeAgencyPage';
import AuctionPage from './pages/AuctionPage';
import LineupPage from './pages/LineupPage';
import SimulatePage from './pages/SimulatePage';
import ResultsPage from './pages/ResultsPage';
import FinalePage from './pages/FinalePage';
import ProfessorPage from './pages/professor/ProfessorPage';
import BigscreenPage from './pages/bigscreen/BigscreenPage';
import { PresentationStandingsRoute } from './components/shell/PresentationStandingsRoute';
import styles from './components/shell/StudentShell.module.css';

function StudentRoutes() {
  return (
    <RoundPresentationProvider>
      <div className={styles.shell}><Outlet /></div>
    </RoundPresentationProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <PhaseRouter />
        <Routes>
          <Route element={<StudentRoutes />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/lobby" element={<LobbyPage />} />
            <Route path="/game/office" element={<FrontOfficePage />} />
            <Route path="/game/market" element={<FreeAgencyPage />} />
            <Route path="/game/auction" element={<AuctionPage />} />
            <Route path="/game/lineup" element={<LineupPage />} />
            <Route path="/game/simulate" element={<SimulatePage />} />
            <Route path="/game/results" element={<ResultsPage />} />
            <Route path="/game/conclusion" element={<FinalePage />} />
            <Route path="/standings" element={<PresentationStandingsRoute />} />
          </Route>
          <Route path="/professor"
            element={<ProfessorProvider><ProfessorPage /></ProfessorProvider>} />
          <Route path="/bigscreen"
            element={<ProfessorProvider><BigscreenPage /></ProfessorProvider>} />
        </Routes>
      </GameProvider>
    </AuthProvider>
  );
}
