import { Route, Routes } from 'react-router-dom';

const Stub = ({ name }: { name: string }) => (
  <main style={{ color: '#f2f5fa', padding: 24 }}>
    <h1 style={{ color: '#ffc94d', fontStyle: 'italic', textTransform: 'uppercase' }}>
      Salary Showdown
    </h1>
    <p data-testid="stub">{name} — under construction</p>
  </main>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Stub name="Landing" />} />
      <Route path="/lobby" element={<Stub name="Lobby" />} />
      <Route path="/game/office" element={<Stub name="Front Office" />} />
      <Route path="/game/market" element={<Stub name="Free Agency" />} />
      <Route path="/game/auction" element={<Stub name="Star Auction" />} />
      <Route path="/game/lineup" element={<Stub name="Set Lineup" />} />
      <Route path="/game/simulate" element={<Stub name="Simulate" />} />
      <Route path="/game/results" element={<Stub name="Results" />} />
      <Route path="/game/conclusion" element={<Stub name="Finale (Plan 3)" />} />
      <Route path="/standings" element={<Stub name="Standings" />} />
    </Routes>
  );
}
