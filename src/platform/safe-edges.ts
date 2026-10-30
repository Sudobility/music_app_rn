/**
 * Which edges of the screen a layout clears, for the device in hand: the
 * rule in `safe-edges-rule.ts`, fed the form factor and where the notch is —
 * and then widened to whatever iOS *actually* insets.
 *
 * `useNotchPosition` (building_blocks_rn) says which side a cutout is on,
 * natively on iOS, so the far side of a landscape phone can be used to the
 * edge. But the heuristic does not know every device: on the iPhone Duo it
 * returns `null` while the real right inset is 84pt, so the rule alone clears
 * nothing and the bars and the score draw under the cutout and the home
 * indicator. The real `useSafeAreaInsets()` are the ground truth, so an edge
 * iOS insets is cleared whether or not the heuristic saw it. This only *adds*
 * clearing — where the rule already names an edge it stays, and the far side
 * of a phone that iOS leaves at zero stays at the edge as before.
 */
import { useMemo } from 'react';
import { useFormFactor } from '@sudobility/components-rn';
import { useNotchPosition } from '@sudobility/building_blocks_rn';
import { useSafeAreaInsets } from '@/platform/SafeArea';
import { edgesAmong, safeEdgesFor } from './safe-edges-rule';
import type { Edge, SafeEdges } from './safe-edges-rule';

export type { Edge, SafeEdges } from './safe-edges-rule';

export function useSafeEdges(): SafeEdges {
  const formFactor = useFormFactor();
  const notch = useNotchPosition();
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    const base = safeEdgesFor(formFactor, notch);
    // A window has no insets to read; keep the rule's answer verbatim.
    if (formFactor === 'desktop') return base;
    return {
      top: base.top || insets.top > 0,
      bottom: base.bottom || insets.bottom > 0,
      left: base.left || insets.left > 0,
      right: base.right || insets.right > 0,
    };
  }, [formFactor, notch, insets.top, insets.bottom, insets.left, insets.right]);
}

export function useSafeEdgeList(among: readonly Edge[]): Edge[] {
  const edges = useSafeEdges();
  return useMemo(() => edgesAmong(edges, among), [edges, among]);
}
