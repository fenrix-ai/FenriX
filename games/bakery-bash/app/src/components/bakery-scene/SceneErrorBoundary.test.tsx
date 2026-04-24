import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SceneErrorBoundary } from './SceneErrorBoundary'

function Kaboom(): React.ReactElement {
  throw new Error('render crash')
}

describe('<SceneErrorBoundary>', () => {
  it('catches errors from children and shows fallback text', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <SceneErrorBoundary teamName="TEST">
        <Kaboom />
      </SceneErrorBoundary>,
    )
    expect(container.textContent).toContain('TEST')
    expect(container.textContent).toContain('Simulating')
    spy.mockRestore()
  })

  it('renders children normally when no error', () => {
    const { container } = render(
      <SceneErrorBoundary teamName="TEST">
        <div data-testid="child">hello</div>
      </SceneErrorBoundary>,
    )
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy()
  })
})
