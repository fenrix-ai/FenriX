export type TeamMember = {
  name: string
  role: string
  motto?: string
  photo?: string
}

export const team: TeamMember[] = [
  { name: 'Prof. Tim Frenzel',     role: 'Faculty Advisor',     motto: 'Do the Hard Things' },
  { name: 'Dylan Massaro',         role: 'Teaching Assistant'  },
  { name: 'Katrina McCay',         role: 'Teaching Assistant'  },
  { name: 'Mia Truong',            role: 'Teaching Assistant'  },
  { name: 'Dylan Barlava',         role: 'Student Engineer'    },
  { name: 'Kavin Ravi',            role: 'Student Engineer'    },
  { name: 'Scott Switzer',         role: 'Student Engineer'    },
  { name: 'Sofia Morales Vilchis', role: 'Student Engineer'    }
]
