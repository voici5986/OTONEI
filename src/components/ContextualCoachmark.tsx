import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COACHMARK_OBSTACLE_SELECTOR } from '../config/coachmark.mjs';

const FALLBACK_GAP = 12;
const ANIMATION_TRACKING_MS = 1000;

interface Props {
  target: string;
  text: string;
  label: string;
  onDismiss: () => void;
}
interface Position {
  element: HTMLElement;
  left: number;
  top: number;
  arrow: number;
  arrowLength: number;
  side: 'above' | 'below';
  targetLeft: number;
  targetTop: number;
  targetWidth: number;
  targetHeight: number;
}

function isVisible(element: Element) {
  if (!element.isConnected || !element.getClientRects().length) return false;
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) === 0
    )
      return false;
  }
  return true;
}

function hasModal() {
  return [...document.querySelectorAll('dialog[open], [aria-modal="true"], .modal.show')].some(
    isVisible
  );
}

/** A passive target outline plus a nonmodal, independently positioned text surface. */
export default function ContextualCoachmark({ target, text, label, onDismiss }: Props) {
  const textId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const positionRef = useRef<Position | null>(null);
  const describedTargetRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!layerRef.current || !bubbleRef.current) return;
    const layer = layerRef.current;
    const bubble = bubbleRef.current;
    let frame = 0;
    let animationUntil = 0;
    let observedTarget: HTMLElement | null = null;
    let observedAnchor: HTMLElement | null = null;
    const update = (next: Position | null) => {
      const previous = positionRef.current;
      if (
        previous === next ||
        (previous &&
          next &&
          previous.element === next.element &&
          previous.left === next.left &&
          previous.top === next.top &&
          previous.arrow === next.arrow &&
          previous.arrowLength === next.arrowLength &&
          previous.side === next.side &&
          previous.targetLeft === next.targetLeft &&
          previous.targetTop === next.targetTop &&
          previous.targetWidth === next.targetWidth &&
          previous.targetHeight === next.targetHeight)
      )
        return;
      if (!next && bubble.contains(document.activeElement) && !hasModal()) {
        const previousTarget = positionRef.current?.element;
        if (previousTarget && isVisible(previousTarget))
          previousTarget.focus({ preventScroll: true });
      }
      positionRef.current = next;
      setPosition(next);
    };
    function describe(element: HTMLElement | null) {
      const previous = describedTargetRef.current;
      if (previous === element) return;
      if (previous) {
        const remaining = (previous.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter((token) => token && token !== textId);
        if (remaining.length) previous.setAttribute('aria-describedby', remaining.join(' '));
        else previous.removeAttribute('aria-describedby');
      }
      describedTargetRef.current = element;
      if (element) {
        const tokens = new Set(
          (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
        );
        tokens.add(textId);
        element.setAttribute('aria-describedby', [...tokens].join(' '));
      }
    }
    function findTarget() {
      if (hasModal()) return null;
      return (
        [...document.querySelectorAll<HTMLElement>(`[data-coachmark="${target}"]`)].find(
          (element) => {
            if (!isVisible(element) || element.matches(':disabled, [aria-disabled="true"]'))
              return false;
            const anchor = element.querySelector<HTMLElement>('[data-coachmark-anchor]') ?? element;
            const rect = anchor.getBoundingClientRect();
            const viewport = window.visualViewport;
            const left = viewport?.offsetLeft ?? 0;
            const top = viewport?.offsetTop ?? 0;
            const hit =
              typeof document.elementsFromPoint === 'function'
                ? document
                    .elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
                    .find((node) => !layer.contains(node))
                : document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              rect.left >= left &&
              rect.top >= top &&
              rect.right <= left + (viewport?.width ?? window.innerWidth) &&
              rect.bottom <= top + (viewport?.height ?? window.innerHeight) &&
              !!hit &&
              element.contains(hit)
            );
          }
        ) ?? null
      );
    }
    // The description is available before the first animation-frame placement.
    describe(findTarget());
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(bubble);
    resizeObserver?.observe(layer);

    function measure() {
      frame = 0;
      let next: Position | null = null;
      const element = findTarget();
      if (!element) describe(null);
      if (observedTarget !== element) {
        if (observedTarget) resizeObserver?.unobserve(observedTarget);
        observedTarget = element ?? null;
        if (observedTarget) resizeObserver?.observe(observedTarget);
      }
      const anchor = element?.querySelector<HTMLElement>('[data-coachmark-anchor]') ?? element;
      if (observedAnchor !== anchor) {
        if (observedAnchor && observedAnchor !== observedTarget)
          resizeObserver?.unobserve(observedAnchor);
        observedAnchor = anchor ?? null;
        if (observedAnchor && observedAnchor !== observedTarget)
          resizeObserver?.observe(observedAnchor);
      }
      if (element) {
        const rect = (anchor ?? element).getBoundingClientRect();
        const bounds = layer.getBoundingClientRect();
        const viewport = window.visualViewport;
        const visibleLeft = viewport?.offsetLeft ?? 0;
        const visibleRight = visibleLeft + (viewport?.width ?? window.innerWidth);
        const visibleTop = viewport?.offsetTop ?? 0;
        const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
        const leftBound = Math.max(bounds.left, visibleLeft);
        const rightBound = Math.min(bounds.right, visibleRight);
        const topBound = Math.max(bounds.top, visibleTop);
        const bottomBound = Math.min(bounds.bottom, visibleBottom);
        const center = rect.left + rect.width / 2;
        describe(element);
        const { width, height } = bubble.getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(layer).rowGap) || FALLBACK_GAP;
        const obstacles = [...document.querySelectorAll<HTMLElement>(COACHMARK_OBSTACLE_SELECTOR)]
          .filter(
            (control) =>
              !layer.contains(control) &&
              control !== element &&
              !element.contains(control) &&
              !control.contains(element) &&
              isVisible(control)
          )
          .map((control) => control.getBoundingClientRect());
        const clampLeft = (value: number) =>
          Math.max(leftBound, Math.min(value, rightBound - width));
        for (const side of ['above', 'below'] as const) {
          const preferredTop = side === 'above' ? rect.top - gap - height : rect.bottom + gap;
          const candidateTops = [
            ...new Set([
              preferredTop,
              ...obstacles.map((obstacle) =>
                side === 'above' ? obstacle.top - gap - height : obstacle.bottom + gap
              ),
            ]),
          ].sort((a, b) => (side === 'above' ? b - a : a - b));
          for (const top of candidateTops) {
            const arrowLength = side === 'above' ? rect.top - top - height : top - rect.bottom;
            if (arrowLength < gap || arrowLength > gap * 4) continue;
            if (top < topBound || top + height > bottomBound || width > rightBound - leftBound)
              continue;
            for (const left of new Set([
              clampLeft(center - width / 2),
              clampLeft(rect.left),
              clampLeft(rect.right - width),
            ])) {
              const arrow = center - left;
              if (arrow < gap || arrow > width - gap) continue;
              if (
                obstacles.some(
                  (obstacle) =>
                    left < obstacle.right &&
                    left + width > obstacle.left &&
                    top < obstacle.bottom &&
                    top + height > obstacle.top
                )
              )
                continue;
              next = {
                element,
                left,
                top,
                arrow,
                arrowLength,
                side,
                targetLeft: rect.left,
                targetTop: rect.top,
                targetWidth: rect.width,
                targetHeight: rect.height,
              };
              break;
            }
            if (next) break;
          }
          if (next) break;
        }
      }
      update(next);
      if (performance.now() < animationUntil) schedule();
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function followTransition(event: Event) {
      if (event.target instanceof Node && layer?.contains(event.target)) return;
      // Bound animation tracking so an unrelated infinite animation cannot keep it alive.
      animationUntil = performance.now() + ANIMATION_TRACKING_MS;
      schedule();
    }
    const mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => !layer.contains(record.target))) schedule();
    });
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'hidden',
        'open',
        'aria-modal',
        'disabled',
        'aria-disabled',
      ],
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    document.addEventListener('transitionrun', followTransition, true);
    document.addEventListener('animationstart', followTransition, true);
    schedule();
    return () => {
      if (bubble.contains(document.activeElement) && !hasModal()) {
        const element = describedTargetRef.current;
        if (element && isVisible(element)) element.focus({ preventScroll: true });
      }
      describe(null);
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('transitionrun', followTransition, true);
      document.removeEventListener('animationstart', followTransition, true);
      positionRef.current = null;
    };
  }, [target, textId]);

  const dismiss = () => {
    if (hasModal()) return;
    if (bubbleRef.current?.contains(document.activeElement))
      positionRef.current?.element.focus({ preventScroll: true });
    onDismiss();
  };
  useEffect(() => {
    if (!position) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasModal()) return;
      const ownsFocus = bubbleRef.current?.contains(document.activeElement);
      if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (!event.shiftKey && document.activeElement === position.element) {
          event.preventDefault();
          bubbleRef.current?.querySelector('button')?.focus({ preventScroll: true });
        } else if (!event.shiftKey && ownsFocus) {
          const controls = [
            ...document.querySelectorAll<HTMLElement>(
              'button, a[href], input, select, textarea, [tabindex]'
            ),
          ].filter(
            (control) =>
              control.tabIndex >= 0 &&
              isVisible(control) &&
              !control.matches(':disabled, [aria-disabled="true"]') &&
              !layerRef.current?.contains(control)
          );
          const next = controls[controls.indexOf(position.element) + 1];
          if (controls.includes(position.element) && next) {
            event.preventDefault();
            next.focus({ preventScroll: true });
          }
        } else if (event.shiftKey && ownsFocus) {
          event.preventDefault();
          position.element.focus({ preventScroll: true });
        }
        return;
      }
      if (event.key !== 'Escape' || !ownsFocus) return;
      event.preventDefault();
      if (bubbleRef.current?.contains(document.activeElement))
        positionRef.current?.element.focus({ preventScroll: true });
      onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [position, onDismiss]);

  return createPortal(
    <div ref={layerRef} className="coachmark-layer">
      <span id={textId} className="coachmark-description">
        {text}
      </span>
      {position && (
        <div
          className="coachmark-highlight"
          aria-hidden="true"
          style={{
            left: position.targetLeft,
            top: position.targetTop,
            width: position.targetWidth,
            height: position.targetHeight,
          }}
        />
      )}
      <section
        ref={bubbleRef}
        className="player-coachmark"
        aria-label={label}
        data-side={position?.side}
        style={{
          visibility: position ? 'visible' : 'hidden',
          left: position?.left ?? 0,
          top: position?.top ?? 0,
        }}
      >
        <span>{text}</span>
        <button
          type="button"
          className="ui-icon-button"
          aria-label={`关闭${label}`}
          onClick={dismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
        <span
          className="coachmark-arrow"
          aria-hidden="true"
          style={{ left: position?.arrow ?? 0, height: position?.arrowLength ?? 0 }}
        />
      </section>
    </div>,
    document.body
  );
}
