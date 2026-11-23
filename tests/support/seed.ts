// Seeded randomness for simulation tests: replaces Math.random with a
// deterministic PRNG (mulberry32) so a failing run can be reproduced exactly.
// Seed from TEST_SEED (default 20261122); printed so a failure can be re-run.
export function seedRandom(defaultSeed = 20261122): number {
  const seed = Number(process.env.TEST_SEED ?? defaultSeed) >>> 0;
  let a = seed;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  console.log(`(random seed ${seed}; re-run with TEST_SEED=${seed})`);
  return seed;
}
