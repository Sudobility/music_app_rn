/**
 * The notation glyphs, replayed from the description the web toolbar draws.
 *
 * Two things here are silent when wrong, which is why they are pinned rather
 * than eyeballed. `currentColor` is an SVG idea `react-native-svg` does not
 * resolve: leave it unsubstituted and the glyph stops following the theme
 * without anything throwing. And `fill="none"` is how the authored shapes
 * express an *outline* — an open notehead, a hollow bracket — so overwriting it
 * with the icon colour fills those glyphs solid, which reads as a different
 * musical symbol entirely.
 *
 * The third check is structural: `renderShape` ends in `default: return null`,
 * so a shape kind it does not handle vanishes with no error. Counting emitted
 * elements against the authored data is what turns that into a failure.
 *
 * Props are read with `UNSAFE_queryAllByType` rather than from `toJSON()`
 * deliberately — by the time a shape reaches the host tree react-native-svg has
 * processed `#ff0000` into `{payload, type}` and `"none"` into `null`, so
 * asserting there would pin that library's internal colour encoding instead of
 * this file's substitution.
 */
import { Circle, Ellipse, Path, Rect, Text as SvgText } from 'react-native-svg';
import { NOTATION_ICONS } from '@sudobility/music_types';
import type {
  NotationIconName,
  NotationIconShape,
} from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import { NotationIcon } from '@sudobility/music_ui_rn';

const ICON_NAMES = Object.keys(NOTATION_ICONS) as NotationIconName[];

/** The five leaf components; `G` is excluded because `Svg` emits one itself. */
const LEAF_TYPES = [Path, Rect, Circle, Ellipse, SvgText] as const;

function leafProps(view: ReturnType<typeof renderWithApp>) {
  return LEAF_TYPES.flatMap(type =>
    view
      .UNSAFE_queryAllByType(type as never)
      .map(node => node.props as Record<string, unknown>),
  );
}

/** Authored shapes that actually draw something, groups walked through. */
function countLeafShapes(shapes: readonly NotationIconShape[]): number {
  return shapes.reduce(
    (total, shape) =>
      total + (shape.kind === 'group' ? countLeafShapes(shape.shapes) : 1),
    0,
  );
}

describe('NotationIcon', () => {
  it('draws every shared glyph without throwing', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    for (const name of ICON_NAMES) {
      expect(() =>
        renderWithApp(<NotationIcon name={name} color="black" />),
      ).not.toThrow();
    }
  });

  it('substitutes currentColor for the resolved colour', () => {
    const view = renderWithApp(
      <NotationIcon
        name={'ArpeggioIcon' as NotationIconName}
        color="#ff0000"
      />,
    );
    const values = leafProps(view).flatMap(p => [p.fill, p.stroke]);
    expect(values).toContain('#ff0000');
    expect(values).not.toContain('currentColor');
  });

  it('leaves no currentColor anywhere, across every glyph', () => {
    for (const name of ICON_NAMES) {
      const view = renderWithApp(<NotationIcon name={name} color="#ff0000" />);
      const values = leafProps(view).flatMap(p => [p.fill, p.stroke]);
      expect(values).not.toContain('currentColor');
    }
  });

  it('keeps fill="none" rather than filling the outline in', () => {
    const view = renderWithApp(
      <NotationIcon
        name={'DeleteMeasureIcon' as NotationIconName}
        color="#ff0000"
      />,
    );
    expect(leafProps(view).map(p => p.fill)).toContain('none');
  });

  it('emits every authored shape — none silently dropped', () => {
    for (const name of ICON_NAMES) {
      const view = renderWithApp(<NotationIcon name={name} color="#123456" />);
      expect(leafProps(view)).toHaveLength(
        countLeafShapes(NOTATION_ICONS[name]),
      );
    }
  });
});
