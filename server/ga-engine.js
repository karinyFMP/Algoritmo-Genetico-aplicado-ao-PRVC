// =============================================================
//  GA Engine — runs on Node.js / Express
//  Problema de Roteamento de Veículos Capacitados (PRVC)
//  Baseado em: Jadson José Monteiro Oliveira — Unibalsas
// =============================================================

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Decode chromosome permutation into vehicle routes respecting capacity */
function decode(chrom, clients, cap) {
  const routes = [];
  let route = [], load = 0;
  for (const idx of chrom) {
    const demand = clients[idx].demand;
    if (load + demand > cap && route.length > 0) {
      routes.push(route);
      route = []; load = 0;
    }
    route.push(idx);
    load += demand;
  }
  if (route.length) routes.push(route);
  return routes;
}

/** Evaluate fitness of a chromosome */
function evaluate(chrom, clients, depot, cap) {
  const routes = decode(chrom, clients, cap);
  let total = 0;
  for (const r of routes) {
    let prev = depot;
    for (const idx of r) {
      total += dist(prev, clients[idx]);
      prev = clients[idx];
    }
    total += dist(prev, depot);
  }
  return { fit: 1 / total, dist: total, routes };
}

/** PMX Crossover — Partially Mapped Crossover */
function pmx(p1, p2) {
  const n = p1.length;
  let a = Math.floor(Math.random() * n);
  let b = Math.floor(Math.random() * n);
  if (a > b) [a, b] = [b, a];
  const child = new Array(n).fill(-1);
  const mapping = {};
  for (let i = a; i <= b; i++) {
    child[i] = p1[i];
    mapping[p1[i]] = p2[i];
  }
  for (let i = 0; i < n; i++) {
    if (child[i] !== -1) continue;
    let val = p2[i];
    const seen = new Set();
    while (mapping[val] !== undefined && !seen.has(val)) {
      seen.add(val);
      val = mapping[val];
    }
    child[i] = val;
  }
  return child;
}

/** Swap mutation */
function mutate(chrom, rate) {
  const c = [...chrom];
  if (Math.random() < rate) {
    const i = Math.floor(Math.random() * c.length);
    const j = Math.floor(Math.random() * c.length);
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/** Tournament selection */
function tournamentSelect(pop, fits, k = 3) {
  let best = Math.floor(Math.random() * pop.length);
  for (let i = 1; i < k; i++) {
    const idx = Math.floor(Math.random() * pop.length);
    if (fits[idx].fit > fits[best].fit) best = idx;
  }
  return pop[best];
}

/** Generate random problem instance */
export function generateProblem(numClients) {
  const depot = { x: 0.5, y: 0.5, label: 'D' };
  const clients = Array.from({ length: numClients }, (_, i) => ({
    x: parseFloat((Math.random() * 0.85 + 0.075).toFixed(4)),
    y: parseFloat((Math.random() * 0.85 + 0.075).toFixed(4)),
    demand: Math.floor(Math.random() * 15) + 5,
    label: String(i + 1),
  }));
  return { depot, clients };
}

/** Initialize random population */
function initPop(size, n) {
  return Array.from({ length: size }, () =>
    shuffle(Array.from({ length: n }, (_, i) => i))
  );
}

/**
 * Run the GA asynchronously, calling onGeneration(data) each step.
 * Returns a promise that resolves when done.
 */
export async function runGA(params, problem, onGeneration) {
  const { popSize, maxGen, mutRate, eliteRate, vehicleCapacity } = params;
  const { depot, clients } = problem;

  let pop = initPop(popSize, clients.length);
  let globalBest = null;

  for (let gen = 1; gen <= maxGen; gen++) {
    // Evaluate all individuals
    const evaluated = pop.map(c => ({
      c,
      f: evaluate(c, clients, depot, vehicleCapacity),
    }));
    evaluated.sort((a, b) => b.f.fit - a.f.fit);

    const best = evaluated[0];
    const avgDist =
      evaluated.reduce((s, e) => s + e.f.dist, 0) / evaluated.length;

    if (!globalBest || best.f.fit > globalBest.fit) {
      globalBest = { ...best.f, chrom: [...best.c] };
    }

    // Emit generation result
    await onGeneration({
      generation: gen,
      maxGen,
      bestDist: globalBest.dist,
      bestRoutes: globalBest.routes,
      avgDist,
      clients,
      depot,
      done: gen === maxGen,
    });

    if (gen === maxGen) break;

    // Build next population
    const eliteCount = Math.max(1, Math.round(popSize * eliteRate));
    const sortedPop = evaluated.map(e => e.c);
    const sortedFit = evaluated.map(e => e.f);
    const nextPop = sortedPop.slice(0, eliteCount).map(c => [...c]);

    while (nextPop.length < popSize) {
      const p1 = tournamentSelect(sortedPop, sortedFit);
      const p2 = tournamentSelect(sortedPop, sortedFit);
      nextPop.push(mutate(pmx(p1, p2), mutRate));
    }
    pop = nextPop;

    // Yield to event loop every 5 gens to avoid blocking
    if (gen % 5 === 0) {
      await new Promise(r => setImmediate(r));
    }
  }
}
