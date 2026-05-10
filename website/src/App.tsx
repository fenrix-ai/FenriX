import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { DemoBakeryBash } from './pages/DemoBakeryBash'

export function App() {
  return (
    <BrowserRouter>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:rounded focus:bg-cyan focus:text-bg focus:font-medium z-[100]"
      >
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/demo/bakery-bash" element={<DemoBakeryBash />} />
      </Routes>
    </BrowserRouter>
  )
}
