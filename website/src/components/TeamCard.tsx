import { GeometricAvatar } from './GeometricAvatar'
import type { TeamMember } from '../data/team'

export function TeamCard({ member }: { member: TeamMember }) {
  return (
    <article
      data-photo={member.photo ?? ''}
      className="rounded-xl border border-white/8 bg-surface p-5 hover:bg-surface-raised hover:border-cyan/30 transition-colors"
    >
      <GeometricAvatar name={member.name} photo={member.photo} size={88} />
      <h3 className="mt-4 font-display font-bold text-lg leading-snug">{member.name}</h3>
      <div className="mt-1 font-mono text-[10px] tracking-widest uppercase text-ink-dim">
        {member.role}
      </div>
      {member.motto && (
        <div className="mt-3 text-sm text-cyan-soft italic">"{member.motto}"</div>
      )}
    </article>
  )
}
