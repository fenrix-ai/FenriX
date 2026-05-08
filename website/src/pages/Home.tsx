import { Nav } from '../components/Nav'
import { Hero } from '../sections/Hero'
import { Mission } from '../sections/Mission'
import { Work } from '../sections/Work'
import { BakeryBashFeature } from '../sections/BakeryBashFeature'
import { Team } from '../sections/Team'
import { Footer } from '../sections/Footer'

export function Home() {
  return (
    <>
      <Nav />
      <main className="pt-16">
        <Hero />
        <Mission />
        <Work />
        <BakeryBashFeature />
        <Team />
      </main>
      <Footer />
    </>
  )
}
