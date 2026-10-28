// A seeded generator makes battles reproducible in tests and bug reports.
export function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
