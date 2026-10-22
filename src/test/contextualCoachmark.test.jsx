import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ContextualCoachmark from '../components/ContextualCoachmark';

let frames;
let target;
let noSpace;
const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
beforeEach(() => {
  frames = [];
  noSpace = false;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
    return this.hidden ? [] : [this.getBoundingClientRect()];
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('coachmark-layer')) return rect(16, 16, 992, 736);
    if (this.classList.contains('player-coachmark')) return rect(0, 0, noSpace ? 2000 : 200, 60);
    return rect(400, 400, 100, 40);
  });
  target = document.createElement('button');
  target.dataset.coachmark = 'test';
  target.setAttribute('aria-describedby', 'existing');
  document.body.append(target);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  document.elementsFromPoint = () => [target];
});
afterEach(() => {
  cleanup();
  target.remove();
  document.querySelector('[data-test-modal]')?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const flush = () =>
  act(() => {
    const pending = frames.splice(0);
    pending.forEach((callback) => callback());
  });
const mount = (dismiss = vi.fn()) =>
  render(
    <ContextualCoachmark target="test" text="Helpful description" label="Tip" onDismiss={dismiss} />
  );

it('portals a separate accessible description before placement and retains it when no bubble fits', () => {
  noSpace = true;
  const { container, unmount } = mount();
  const ids = target.getAttribute('aria-describedby').split(' ');
  expect(ids).toHaveLength(2);
  expect(document.getElementById(ids[1])).toHaveTextContent('Helpful description');
  expect(container).toBeEmptyDOMElement();
  flush();
  expect(target.getAttribute('aria-describedby')).toBe(ids.join(' '));
  expect(screen.queryByRole('region', { name: 'Tip' })).not.toBeInTheDocument();
  target.setAttribute('aria-describedby', `${target.getAttribute('aria-describedby')} added`);
  unmount();
  expect(target).toHaveAttribute('aria-describedby', 'existing added');
});
it('lets Tab from the target reach close and Shift Tab return without autofocus', () => {
  target.focus();
  mount();
  flush();
  expect(target).toHaveFocus();
  fireEvent.keyDown(target, { key: 'Tab' });
  const close = screen.getByRole('button', { name: '关闭Tip' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(target).toHaveFocus();
});
it('handles Escape only while the bubble owns focus and restores target on dismissal', () => {
  const dismiss = vi.fn();
  mount(dismiss);
  flush();
  target.focus();
  fireEvent.keyDown(target, { key: 'Escape' });
  expect(dismiss).not.toHaveBeenCalled();
  screen.getByRole('button', { name: '关闭Tip' }).focus();
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(dismiss).toHaveBeenCalledOnce();
  expect(target).toHaveFocus();
});
it('recovers target focus on unmount while close owns focus', () => {
  const { unmount } = mount();
  flush();
  screen.getByRole('button', { name: '关闭Tip' }).focus();
  unmount();
  expect(target).toHaveFocus();
});
it('removes description for a hidden target and restores it when target returns', () => {
  mount();
  flush();
  target.hidden = true;
  fireEvent.resize(window);
  flush();
  expect(target).toHaveAttribute('aria-describedby', 'existing');
  target.hidden = false;
  fireEvent.resize(window);
  flush();
  expect(target.getAttribute('aria-describedby').split(' ')).toHaveLength(2);
});
it('suppresses descriptions during modal display without stealing modal focus, then cleans up', () => {
  const { unmount } = mount();
  flush();
  screen.getByRole('button', { name: '关闭Tip' }).focus();
  const modal = document.createElement('div');
  modal.dataset.testModal = '';
  modal.setAttribute('aria-modal', 'true');
  const input = document.createElement('input');
  modal.append(input);
  document.body.append(modal);
  input.focus();
  fireEvent.resize(window);
  flush();
  expect(target).toHaveAttribute('aria-describedby', 'existing');
  expect(input).toHaveFocus();
  unmount();
  expect(input).toHaveFocus();
});

it('continues normal tab order after closing control without trapping focus', () => {
  const next = document.createElement('button');
  target.after(next);
  mount();
  flush();
  screen.getByRole('button', { name: '关闭Tip' }).focus();
  fireEvent.keyDown(document.activeElement, { key: 'Tab' });
  expect(next).toHaveFocus();
  next.remove();
});
it('returns focus to target when the bubble loses placement and resumes without autofocus', () => {
  mount();
  flush();
  screen.getByRole('button', { name: '关闭Tip' }).focus();
  noSpace = true;
  fireEvent.resize(window);
  flush();
  expect(target).toHaveFocus();
  expect(target.getAttribute('aria-describedby').split(' ')).toHaveLength(2);
  noSpace = false;
  fireEvent.resize(window);
  flush();
  expect(target).toHaveFocus();
});
it('does not describe a covered control before first placement', () => {
  document.elementsFromPoint = () => [document.body];
  mount();
  expect(target).toHaveAttribute('aria-describedby', 'existing');
  flush();
  expect(screen.queryByRole('region', { name: 'Tip' })).not.toBeInTheDocument();
});
