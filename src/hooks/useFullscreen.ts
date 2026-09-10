import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Is there a Fullscreen API to call at all?
 *
 * Checked on the prototype rather than on the target node, so the answer is
 * available on the very first render, while the ref is still empty. jsdom
 * ships none of this, so tests (and old browsers) legitimately report no
 * support.
 */
function detectSupport(): boolean {
  return (
    typeof Element.prototype.requestFullscreen === 'function' &&
    typeof document.exitFullscreen === 'function'
  );
}

/** Is the document in fullscreen *because of this element*? */
function isTargetFullscreen(target: RefObject<HTMLElement | null>): boolean {
  const element = target.current;
  return element != null && document.fullscreenElement === element;
}

/**
 * Drives the Fullscreen API for a single element.
 *
 * `isFullscreen` follows `document.fullscreenElement`, never our own last
 * click: the user leaves fullscreen with Esc as often as with the button, and
 * the browser may refuse the request outright — a flag we flipped ourselves
 * would then show the wrong icon for the rest of the session.
 *
 * When `supported` is false the caller should render no control at all; a
 * button that provably cannot work is worse than a missing one.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>): {
  isFullscreen: boolean;
  supported: boolean;
  toggle: () => void;
} {
  // The initial read matters when only the control remounts (panel toggled,
  // header re-keyed) while the element it points at stays fullscreen.
  const [isFullscreen, setIsFullscreen] = useState(() => isTargetFullscreen(target));
  const supported = detectSupport();

  useEffect(() => {
    // The document is the source of truth, so subscribe to it instead of
    // tracking what we asked for.
    const syncFromDocument = () => setIsFullscreen(isTargetFullscreen(target));

    document.addEventListener('fullscreenchange', syncFromDocument);
    // Without this the listener outlives the panel and keeps setting state on
    // a component that is gone.
    return () => document.removeEventListener('fullscreenchange', syncFromDocument);
  }, [target]);

  const toggle = () => {
    const element = target.current;
    if (element == null) return;

    // Ask the document rather than `isFullscreen`: the state is a render behind
    // an Esc keypress, and exiting when nothing is fullscreen rejects.
    // Optional calls keep a caller that ignored `supported` from crashing.
    const pending = isTargetFullscreen(target)
      ? document.exitFullscreen?.()
      : element.requestFullscreen?.();

    // The request can be rejected by the user or the browser (no user gesture,
    // denied permission, another element already fullscreen). Swallowing that
    // keeps a click from becoming an unhandled rejection, and the state stays
    // whatever `fullscreenchange` last reported, so nothing drifts apart.
    void Promise.resolve(pending).catch(() => undefined);
  };

  return { isFullscreen, supported, toggle };
}
