import { vi } from 'vitest';

export function mockResizeAnimationFrame() {
  const callbacks = new Map();
  let nextId = 0;
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id);
  });
  return {
    callbacks,
    request,
    cancel,
    flush() {
      const frame = [...callbacks.values()];
      callbacks.clear();
      frame.forEach((callback) => callback(performance.now()));
    },
  };
}
