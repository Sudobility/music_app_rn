/**
 * The detail of a split view, held to the web's measure.
 *
 * The web's master/detail layout caps the detail's content at 1024 and
 * centres it past that; a desktop window is wide enough for it to matter, and
 * a line of text the width of one is not a line anybody reads. The list is
 * not capped: it has a width of its own.
 */
import { useState } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '@/test/render';
import {
  DETAIL_MAX_WIDTH,
  DETAIL_PADDING,
} from '@/components/layout/EmbeddedScreen';
import {
  PHONE_PRIMARY_PANEL_WIDTH,
  PRIMARY_PANEL_WIDTH,
  SplitMenuList,
  SplitPanel,
  SplitViewContainer,
} from './SplitViewContainer';

describe('SplitPanel', () => {
  it('caps what the detail holds at the web’s width, and centres it', () => {
    const view = renderWithApp(
      <SplitPanel secondary title="Chosen">
        <Text>detail</Text>
      </SplitPanel>,
    );
    const content = view.getByTestId('split-detail-content');
    expect(StyleSheet.flatten(content.props.style).maxWidth).toBe(1024);
    expect(DETAIL_MAX_WIDTH).toBe(1024);
    expect(content.props.className).toContain('w-full');
    expect(view.getByTestId('split-detail').props.className).toContain(
      'items-center',
    );
    expect(view.getByText('detail')).toBeTruthy();
  });

  it('keeps a titled bar over each panel under the system’s tab bar', () => {
    // A bar with nothing in it over a list is a strip of blank.
    const list = renderWithApp(
      <SplitPanel title="Projects">
        <Text>list</Text>
      </SplitPanel>,
    );
    expect(list.getByText('Projects')).toBeTruthy();
    expect(list.getByText('list')).toBeTruthy();
    const detail = renderWithApp(
      <SplitPanel secondary title="New Project">
        <Text>detail</Text>
      </SplitPanel>,
    );
    expect(detail.getByText('New Project')).toBeTruthy();
  });

  it('draws no bar in a desktop window, and heads the detail instead', () => {
    const os = Platform.OS;
    Platform.OS = 'macos';
    try {
      const list = renderWithApp(
        <SplitPanel title="Projects">
          <Text>list</Text>
        </SplitPanel>,
      );
      expect(list.queryByRole('header')).toBeNull();
      const detail = renderWithApp(
        <SplitPanel secondary title="New Project">
          <Text>detail</Text>
        </SplitPanel>,
      );
      expect(detail.getByText('New Project')).toBeTruthy();
    } finally {
      Platform.OS = os;
    }
  });

  it('leaves the list alone', () => {
    const view = renderWithApp(
      <SplitPanel title="List">
        <Text>list</Text>
      </SplitPanel>,
    );
    expect(view.queryByTestId('split-detail-content')).toBeNull();
    expect(view.getByText('list')).toBeTruthy();
  });

  it('insets the detail as the web does: px-6, pt-6, pb-6', () => {
    expect(DETAIL_PADDING).toBe(24);
  });

  it('gives a phone a narrower list than a tablet or a desktop', () => {
    expect(PHONE_PRIMARY_PANEL_WIDTH).toBe(240);
    expect(PRIMARY_PANEL_WIDTH).toBe(320);
  });
});

describe('SplitViewContainer, collapsed', () => {
  // A split view whose list and detail are told apart by their text, over a
  // selection the list changes — the shape every collapsing screen has.
  function Drilldown() {
    const [selected, setSelected] = useState('alpha');
    return (
      <SplitViewContainer
        collapsible
        primaryPanel={
          <SplitPanel title="Menu">
            <SplitMenuList
              label="Menu"
              entries={[
                { id: 'alpha', label: 'Alpha' },
                { id: 'beta', label: 'Beta' },
              ]}
              selected={selected}
              onSelect={setSelected}
            />
          </SplitPanel>
        }
        secondaryPanel={
          <SplitPanel secondary title="Chosen">
            <Text>detail-body</Text>
          </SplitPanel>
        }
      />
    );
  }

  function layoutWidth(
    view: ReturnType<typeof renderWithApp>,
    width: number,
  ): void {
    fireEvent(view.getByTestId('split-container'), 'layout', {
      nativeEvent: { layout: { width, height: 800, x: 0, y: 0 } },
    });
  }

  it('shows one column at a time on a narrow phone, drilling in and back', () => {
    const view = renderWithApp(<Drilldown />);
    layoutWidth(view, 390);
    // The list is the one column; the detail is not beside it, and the list's
    // bar carries no way back.
    expect(view.getByText('Alpha')).toBeTruthy();
    expect(view.queryByText('detail-body')).toBeNull();
    expect(view.queryByTestId('split-back')).toBeNull();
    // Choosing a row drills into the detail, whose bar now has the way back.
    fireEvent.press(view.getByLabelText('Beta'));
    expect(view.getByText('detail-body')).toBeTruthy();
    expect(view.queryByText('Alpha')).toBeNull();
    // Back returns to the list.
    fireEvent.press(view.getByTestId('split-back'));
    expect(view.getByText('Alpha')).toBeTruthy();
    expect(view.queryByText('detail-body')).toBeNull();
  });

  it('keeps both panels side by side where the view is wide', () => {
    const view = renderWithApp(<Drilldown />);
    layoutWidth(view, 900);
    expect(view.getByText('Alpha')).toBeTruthy();
    expect(view.getByText('detail-body')).toBeTruthy();
    expect(view.queryByTestId('split-back')).toBeNull();
  });
});
