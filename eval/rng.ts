// Seeded RNG (mulberry32), implemented locally so the dataset is reproducible from the seed alone.

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  digits(n: number): string;
  chars(alphabet: string, n: number): string;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const chars = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[int(0, alphabet.length - 1)]).join("");
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)]!,
    digits: (n) => chars("0123456789", n),
    chars,
  };
}
