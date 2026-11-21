// Animation events: markers on action timelines that gameplay acts on at the
// exact fixed step they are crossed (the ball is struck at the contact frame,
// not when the button is pressed).

export type AnimEventKind = 'plant' | 'contact' | 'touch' | 'touch2' | 'release' | 'end';

export interface AnimMarker { t: number; kind: AnimEventKind }

export interface AnimEvent { kind: AnimEventKind; action: string; time: number }

/** Markers crossed when normalised time moves from a to b. */
export function crossedMarkers(markers: readonly AnimMarker[], a: number, b: number): AnimMarker[] {
  const out: AnimMarker[] = [];
  for (const m of markers) if (m.t > a && m.t <= b) out.push(m);
  return out;
}
