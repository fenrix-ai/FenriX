import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  teamName: string
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[PixelBakeryScene] render crash, falling back', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="pixel-bakery-scene pixel-bakery-scene--fallback"
          role="img"
          aria-label={`${this.props.teamName} bakery — simulating round`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#fbbf24',
            fontFamily: 'monospace',
            fontSize: 14,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>{this.props.teamName}</div>
          <div>Simulating round…</div>
        </div>
      )
    }
    return this.props.children
  }
}
