export type ProjectStatus = 'live' | 'in-development' | 'concept'

export type Project = {
  slug: string
  name: string
  status: ProjectStatus
  domain: string
  tagline: string
  description: string
  href?: string
}

export const projects: Project[] = [
  {
    slug: 'bakery-bash',
    name: 'Bakery Bash',
    status: 'live',
    domain: 'Strategy',
    tagline: 'Competitive bakery sim. Players fight for revenue in a shared plaza.',
    description:
      'Five rounds of pricing, advertising, hiring, and menu decisions. Best strategy wins.',
    href: '/demo/bakery-bash'
  },
  {
    slug: 'front-office',
    name: 'Front Office',
    status: 'in-development',
    domain: 'Sports Analytics',
    tagline: 'NBA general manager game. Build a dynasty with data-driven decisions.',
    description: 'Draft, trade, and develop players using real performance distributions.'
  },
  {
    slug: 'tutor',
    name: 'Tutor',
    status: 'in-development',
    domain: 'Adaptive Learning',
    tagline: 'An AI tutor that gamifies your own lesson material.',
    description: 'Drop in a syllabus. Walk out with quizzes, drills, and a leaderboard.'
  },
  {
    slug: 'debate-arena',
    name: 'Debate Arena',
    status: 'concept',
    domain: 'Rhetoric',
    tagline: 'Real-time debates against an AI opponent. Argument quality is scored.',
    description: 'Cross-examine, rebut, and build your case under the clock.'
  }
]
