/**
 * Rozšíření sekce s grafem na celou obrazovku.
 *
 * jsdom Fullscreen API nezná vůbec, což je zároveň první testovaný případ –
 * bez podpory se tlačítko nesmí vykreslit. Ostatní testy si API naimitují ve
 * stejném rozsahu, jaký komponenta v prohlížeči používá: `requestFullscreen`
 * na cílovém prvku, `exitFullscreen` a `fullscreenElement` na dokumentu.
 * Přechody hlásí prohlížeč událostí `fullscreenchange`, tady ji posíláme ručně.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';
import ChartFullscreenButton from '../components/Chart/ChartFullscreenButton';

/** Elements `requestFullscreen` was called on, i.e. its `this`. */
let requestedOn: Element[] = [];
let requestFullscreen: ReturnType<typeof vi.fn>;
let exitFullscreen: ReturnType<typeof vi.fn>;

/**
 * Fills in the parts of the Fullscreen API jsdom is missing.
 *
 * `requestFullscreen` has to be reachable on the element from the very first
 * render, because that is when the button decides whether it can work at all —
 * hence the prototype. Which element the request belonged to is then asserted
 * through the captured `this`.
 */
function installFullscreenApi(request: () => Promise<void> = () => Promise.resolve()) {
  requestedOn = [];
  requestFullscreen = vi.fn(function (this: Element) {
    requestedOn.push(this);
    return request();
  });
  exitFullscreen = vi.fn(() => Promise.resolve());

  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    writable: true,
    value: requestFullscreen,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    writable: true,
    value: exitFullscreen,
  });
  setFullscreenElement(null);
}

/** Sets `document.fullscreenElement` without announcing the change. */
function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    writable: true,
    value: element,
  });
}

/** Stands in for the transition a browser reports on its own. */
function fullscreenChangedTo(element: Element | null) {
  setFullscreenElement(element);
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}

/** The button sits inside the element it expands, as it does in the chart. */
function Harness() {
  const targetRef = useRef<HTMLDivElement>(null);
  return (
    <ThemeProvider theme={theme}>
      <div ref={targetRef} data-testid="chart-section">
        <ChartFullscreenButton targetRef={targetRef} />
      </div>
    </ThemeProvider>
  );
}

afterEach(() => {
  // The fakes are global, so they have to go: otherwise the "no API support"
  // case would only pass depending on test order.
  Reflect.deleteProperty(Element.prototype, 'requestFullscreen');
  Reflect.deleteProperty(document, 'exitFullscreen');
  Reflect.deleteProperty(document, 'fullscreenElement');
  vi.restoreAllMocks();
});

describe('ChartFullscreenButton', () => {
  it('bez podpory Fullscreen API nevykreslí nic', () => {
    const { getByTestId } = render(<Harness />);

    expect(getByTestId('chart-section')).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('kliknutí požádá o celou obrazovku cílový prvek', () => {
    installFullscreenApi();
    const { getByTestId } = render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit graf na celou obrazovku' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestedOn).toEqual([getByTestId('chart-section')]);
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it('po události fullscreenchange přepne ikonu i aria-label', () => {
    installFullscreenApi();
    const { getByTestId } = render(<Harness />);

    expect(screen.getByLabelText('Zobrazit graf na celou obrazovku')).toBeInTheDocument();
    expect(screen.getByTestId('FullscreenIcon')).toBeInTheDocument();

    fullscreenChangedTo(getByTestId('chart-section'));

    expect(screen.getByLabelText('Ukončit celou obrazovku')).toBeInTheDocument();
    expect(screen.getByTestId('FullscreenExitIcon')).toBeInTheDocument();
    expect(screen.queryByLabelText('Zobrazit graf na celou obrazovku')).not.toBeInTheDocument();
  });

  it('stav sleduje skutečnost, ne vlastní klikání – po odchodu Escapem se vrátí', () => {
    installFullscreenApi();
    const { getByTestId } = render(<Harness />);
    fullscreenChangedTo(getByTestId('chart-section'));

    // Esc never goes through the button; the browser just reports that
    // fullscreen is over.
    fullscreenChangedTo(null);

    expect(screen.getByLabelText('Zobrazit graf na celou obrazovku')).toBeInTheDocument();
    expect(screen.getByTestId('FullscreenIcon')).toBeInTheDocument();
  });

  it('druhé kliknutí celou obrazovku ukončí', () => {
    installFullscreenApi();
    const { getByTestId } = render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit graf na celou obrazovku' }));
    fullscreenChangedTo(getByTestId('chart-section'));
    fireEvent.click(screen.getByRole('button', { name: 'Ukončit celou obrazovku' }));

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('odmítnutá žádost nespadne a nechá stav na místě', async () => {
    installFullscreenApi(() => Promise.reject(new Error('gesture required')));
    render(<Harness />);

    const button = screen.getByRole('button', { name: 'Zobrazit graf na celou obrazovku' });
    expect(() => fireEvent.click(button)).not.toThrow();
    // The rejection lands in a microtask, so without this wait the test would
    // end before an unhandled error could surface.
    await act(async () => {
      await Promise.resolve();
    });

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Zobrazit graf na celou obrazovku')).toBeInTheDocument();
  });

  it('posluchač fullscreenchange se po unmountu odhlásí', () => {
    installFullscreenApi();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = render(<Harness />);
    const added = addSpy.mock.calls.find(([type]) => type === 'fullscreenchange');
    expect(added).toBeDefined();

    unmount();

    // It must be the very listener that subscribed, otherwise it stays hanging
    // around after the panel is toggled.
    expect(removeSpy).toHaveBeenCalledWith('fullscreenchange', added![1]);
  });
});
