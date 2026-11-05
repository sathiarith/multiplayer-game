// What the game loop needs from the outside world. Tests pass fakes instead.
export function browserEnv() {
  return {
    raf: (cb) => window.requestAnimationFrame(cb),
    caf: (id) => window.cancelAnimationFrame(id),
    now: () => performance.now(),
    target: window,
  };
}
