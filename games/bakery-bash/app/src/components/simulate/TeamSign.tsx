interface Props {
  teamName: string
}

export function TeamSign({ teamName }: Props) {
  const display = teamName.trim() || 'My Bakery'
  return (
    <div className="pixel-scene__sign">
      <img src="/assets/scene/wooden-sign.svg" alt="" aria-hidden="true" />
      <div className="pixel-scene__sign-text" title={display}>
        {display}
      </div>
    </div>
  )
}
