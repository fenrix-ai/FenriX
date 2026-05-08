import { Nav } from '../components/Nav'
import { Hero } from '../sections/Hero'
import { Footer } from '../sections/Footer'

export function Home() {
  return (
    <>
      <Nav />
      <main className="pt-16">
        <Hero />
        {/* TODO: Mission, Work, BakeryBashFeature, Team, Contact go here */}
      </main>
      <Footer />
    </>
  )
}
