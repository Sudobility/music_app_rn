/**
 * The editor's title bar, handed to the navigator.
 *
 * What is pinned is the hand-over: on a platform with a native header the
 * name and every button reach the navigator's options, and on one without
 * nothing is asked of it at all.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import * as nativeHeader from '@/app/native-header';
import { renderWithApp, testDocument } from '@/test/render';
import { useEditorHeader } from './useEditorHeader';
import type { TitleBarProps } from '@/components/layout/TitleBar';

// A tablet shows every title-bar action inline; a phone groups the secondary
// ones (Export, Print, …) behind the "…" overflow. These assertions press the
// actions directly, so pin the tablet arrangement (as the toolbar tests do).
jest.mock('@sudobility/components-rn', () => ({
  ...(jest.requireActual('@sudobility/components-rn') as object),
  useFormFactor: () => 'tablet',
}));

function Host({
  setOptions,
  props,
  onMaster,
}: {
  setOptions: (options: NativeStackNavigationOptions) => void;
  props: TitleBarProps;
  onMaster?: (() => void) | undefined;
}) {
  useEditorHeader({ setOptions }, props, onMaster);
  return null;
}

function setup(overrides: Partial<TitleBarProps> = {}, onMaster?: () => void) {
  const setOptions = jest.fn<(options: NativeStackNavigationOptions) => void>();
  const props: TitleBarProps = {
    document: testDocument({ title: 'Quartet' }),
    onSave: jest.fn(),
    onExport: jest.fn(),
    onSettings: jest.fn(),
    onDocuments: jest.fn(),
    ...overrides,
  };
  const view = renderWithApp(
    <Host setOptions={setOptions} props={props} onMaster={onMaster} />,
  );
  return { view, setOptions, props };
}

/** Draws what the navigator was handed, as the navigator would. */
function drawHeader(options: NativeStackNavigationOptions) {
  const title = options.headerTitle;
  const right = options.headerRight;
  if (typeof title !== 'function' || !right) {
    throw new Error('the header was handed no title or no buttons');
  }
  return renderWithApp(
    <>
      {title({ children: '' })}
      {right({ canGoBack: false })}
    </>,
  );
}

describe('useEditorHeader', () => {
  afterEach(() => jest.restoreAllMocks());

  it('puts the name and the buttons on the native header', () => {
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(true);
    const onPrint = jest.fn();
    const { setOptions, props } = setup({ onPrint });
    const options = setOptions.mock.calls[0]![0];
    expect(options.headerShown).toBe(true);

    const header = drawHeader(options);
    expect(header.getByText('Quartet')).toBeTruthy();
    expect(header.getByText('Saved')).toBeTruthy();
    fireEvent.press(header.getByLabelText('Save now'));
    fireEvent.press(header.getByLabelText('Export'));
    fireEvent.press(header.getByLabelText(/print/i));
    fireEvent.press(header.getByLabelText('Projects'));
    fireEvent.press(header.getByLabelText('Settings'));
    expect(props.onSave).toHaveBeenCalled();
    expect(props.onExport).toHaveBeenCalled();
    expect(onPrint).toHaveBeenCalled();
    expect(props.onDocuments).toHaveBeenCalled();
    expect(props.onSettings).toHaveBeenCalled();
  });

  it('leaves out what the title bar would leave out', () => {
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(true);
    const { setOptions } = setup();
    const header = drawHeader(setOptions.mock.calls[0]![0]);
    expect(header.queryByLabelText(/print/i)).toBeNull();
    expect(header.queryByLabelText(/snapshot/i)).toBeNull();
  });

  it('takes the header down when the document leaves the screen', () => {
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(true);
    const { view, setOptions } = setup();
    view.unmount();
    expect(setOptions.mock.calls.at(-1)![0]).toEqual({ headerShown: false });
  });

  it('has no way back where the editor is the first route', () => {
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(true);
    const options = setup().setOptions.mock.calls[0]![0];
    expect(options.headerBackVisible).toBe(false);
    expect(options.headerLeft).toBeUndefined();
  });

  it('offers the way back and the Projects sidebar when pushed above the tabs', () => {
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(true);
    const onMaster = jest.fn();
    const options = setup({}, onMaster).setOptions.mock.calls[0]![0];
    // Stated, or the button below would take the back control's place.
    expect(options.headerBackVisible).toBe(true);

    const left = options.headerLeft;
    if (!left) throw new Error('the header was handed no leading button');
    const header = renderWithApp(<>{left({ canGoBack: true })}</>);
    fireEvent.press(header.getByLabelText('Projects'));
    expect(onMaster).toHaveBeenCalled();
  });

  it('keeps the way back once the document leaves, when pushed above the tabs', () => {
    /*
      The editor with nothing open is still a screen above the tabs. Taking
      the whole header down, as the first-route editor does, would take the
      back control with it and leave a room with no door.
    */
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(true);
    const { view, setOptions } = setup({}, jest.fn());
    view.unmount();
    const last = setOptions.mock.calls.at(-1)![0];
    expect(last.headerShown).toBeUndefined();
    expect(last.headerTitle).toBe('');
  });

  it('asks nothing of the navigator where it draws no header', () => {
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(false);
    const { view, setOptions } = setup();
    view.unmount();
    expect(setOptions).not.toHaveBeenCalled();
  });
});
