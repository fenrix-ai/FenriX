/**
 * Renders the night-veil overlay. The parent PixelBakeryScene controls
 * visibility by toggling the `pixel-scene--night` class on its own wrapper;
 * this component just provides the DOM node that receives the CSS transition.
 */
export function DayNightOverlay() {
  return <div className="pixel-scene__nightveil" aria-hidden="true" />
}
