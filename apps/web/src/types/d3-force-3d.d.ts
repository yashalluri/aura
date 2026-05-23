// Minimal type shims for d3-force-3d (no published @types package as of 2026-05).
declare module "d3-force-3d" {
  // Permissive: the force-simulation API has many overloads; we use enough
  // to position nodes once and read them back.
  export function forceSimulation<T = unknown>(nodes?: T[], dimensions?: number): {
    force(name: string, force: unknown): ReturnType<typeof forceSimulation>;
    tick(n?: number): ReturnType<typeof forceSimulation>;
    stop(): ReturnType<typeof forceSimulation>;
    on(name: string, cb: () => void): ReturnType<typeof forceSimulation>;
  };
  export function forceLink<L = unknown>(links?: L[]): {
    id(accessor: (d: unknown) => string): unknown;
    distance(n: number): unknown;
    strength(n: number): unknown;
  };
  export function forceManyBody(): { strength(n: number): unknown };
  export function forceCenter(x: number, y: number, z: number): unknown;
}
