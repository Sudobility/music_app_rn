/**
 * The property sheet's labelled row.
 *
 * Only one thing here has a branch — `hint` renders nothing when it is absent
 * rather than an empty line — and that is the half worth pinning: four tabs
 * share this row, so a stray blank element under an unhinted field spaces one
 * tab differently from the others, which is the exact "looks broken and nobody
 * can point at it" the component exists to prevent.
 */
import { renderWithApp } from '@/test/render';
import { EmptyTab, Field } from '@sudobility/music_ui_rn';
import { Text } from '@sudobility/components-rn';

describe('Field', () => {
  it('shows the label and its control', () => {
    const view = renderWithApp(
      <Field label="Velocity">
        <Text>64</Text>
      </Field>,
    );
    expect(view.getByText('Velocity')).toBeTruthy();
    expect(view.getByText('64')).toBeTruthy();
  });

  it('renders the hint when given one', () => {
    const view = renderWithApp(
      <Field label="Tempo" hint="in force here">
        <Text>120</Text>
      </Field>,
    );
    expect(view.getByText('in force here')).toBeTruthy();
  });

  it('renders no hint element when there is no hint', () => {
    // The label and the control only — a blank third row would space this
    // field differently from every other one in the sheet.
    const view = renderWithApp(
      <Field label="Tempo">
        <Text>120</Text>
      </Field>,
    );
    expect(view.queryAllByText('')).toHaveLength(0);
    expect(view.getByText('Tempo')).toBeTruthy();
  });
});

describe('EmptyTab', () => {
  it('states why the tab is empty', () => {
    const view = renderWithApp(<EmptyTab message="Select a note" />);
    expect(view.getByText('Select a note')).toBeTruthy();
  });
});
