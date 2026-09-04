// Exhaustive BFS over reachable configurations. This is the load-bearing
// experiment: it tells us whether the move set can genuinely get stuck.
import { Puzzle, applyFlip, applyShrink, applyShrinkEdge, applyGrowEdge,
         key, unitDirs } from '../src/knot.js';

export const pathKey = (path) => path.map(key).join('|');

export function neighbours(dims, cur) {
  const out = [];
  const dirs = unitDirs(dims.length);
  for (let i = 1; i < cur.length - 1; i++) {
    const q = new Puzzle(dims, cur);
    if (applyFlip(q, i)) out.push(q.path);
  }
  for (let i = 1; i < cur.length - 1; i++) {
    const q = new Puzzle(dims, cur);
    if (applyShrink(q, i)) out.push(q.path);
  }
  for (let i = 0; i < cur.length - 3; i++) {
    const q = new Puzzle(dims, cur);
    if (applyShrinkEdge(q, i)) out.push(q.path);
  }
  for (let i = 0; i < cur.length - 1; i++) {
    for (const d of dirs) {
      const q = new Puzzle(dims, cur);
      if (applyGrowEdge(q, i, d)) out.push(q.path);
    }
  }
  return out;
}

// BFS with a hard cap on path length so the space stays finite.
export function explore(dims, startPath, { slack = 2, cap = 300000 } = {}) {
  const start = new Puzzle(dims, startPath);
  const target = start.target;
  const maxLen = start.length + slack;
  let best = start.length, bestPath = start.path;
  const seen = new Set([pathKey(start.path)]);
  const queue = [start.path];
  let head = 0;
  while (head < queue.length) {
    if (seen.size > cap) return { target, best, bestPath, explored: seen.size,
                                  solved: best === target, truncated: true };
    const cur = queue[head++];
    if (cur.length - 1 < best) { best = cur.length - 1; bestPath = cur; }
    if (best === target) break;
    for (const np of neighbours(dims, cur)) {
      if (np.length - 1 > maxLen) continue;
      const k = pathKey(np);
      if (!seen.has(k)) { seen.add(k); queue.push(np); }
    }
  }
  return { target, best, bestPath, explored: seen.size,
           solved: best === target, truncated: false };
}
