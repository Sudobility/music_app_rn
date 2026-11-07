/**
 * The bar's icon button.
 *
 * Small, and load-bearing in two ways. A toggle must report `selected` to the
 * accessibility layer as well as tinting — the tint says it only to somebody
 * looking. And the class strings must be *whole*: Tailwind extracts classes by
 * scanning source text, so an interpolated variant never appears complete in
 * the file and is silently never generated. That fails quietly — the colours
 * still work, the layout does not.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderWithApp } from '@/test/render';
import { IconButton } from '@sudobility/music_ui_rn';

describe('IconButton', () => {
  it('reports pressed state to a screen reader, not only in colour', () => {
    const view = renderWithApp(
      <IconButton label="Note input" selected onPress={jest.fn()}>
        <Text>x</Text>
      </IconButton>,
    );
    expect(
      view.getByLabelText('Note input').props.accessibilityState.selected,
    ).toBe(true);
  });

  it('carries a hint separately from its name', () => {
    /*
      A screen reader announces the *name* to say what a control is; anything
      longer belongs in the hint, read after it. Putting the sentence in the
      name is how "Duplicate the selection" ends up being the button's identity.
    */
    const view = renderWithApp(
      <IconButton
        label="Copy"
        hint="Duplicate the selection"
        onPress={jest.fn()}
      >
        <Text>x</Text>
      </IconButton>,
    );
    const button = view.getByLabelText('Copy');
    expect(button.props.accessibilityHint).toBe('Duplicate the selection');
  });

  it('does not fire while disabled', () => {
    const onPress = jest.fn();
    const view = renderWithApp(
      <IconButton label="Cut" disabled onPress={onPress}>
        <Text>x</Text>
      </IconButton>,
    );
    fireEvent.press(view.getByLabelText('Cut'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('writes whole Tailwind class strings, never interpolated ones', () => {
    // Read as source: an interpolated variant is invisible to the extractor,
    // so the utility is never generated and the control silently loses its
    // layout while keeping its colours.
    const source = readFileSync(
      join(
        __dirname,
        '../../../node_modules/@sudobility/music_ui_rn/src/components/layout/IconButton.tsx',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/className=\{`[^`]*\$\{/);
  });
});
