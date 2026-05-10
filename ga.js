
// ============================================================
//  AG aplicado ao PRVC — Jadson José Monteiro Oliveira
// ============================================================

const ROUTE_COLORS = [
  '#6366f1','#10b981','#f59e0b','#f43f5e','#06b6d4','#a78bfa',
  '#34d399','#fb923c','#38bdf8','#e879f9'
];

// ---- State ----
let depot, clients, bestSolution, historyBest, historyAvg;
let running = false, rafId = null, generation = 0;
let params = {};

// ---- DOM refs ----
const mapCanvas  = document.getElementById('mapCanvas');
const fitCanvas  = document.getElementById('fitnessChart');
const mapCtx     = mapCanvas.getContext('2d');
const fitCtx     = fitCanvas.getContext('2d');

// ---- Sliders ----
function initSliders() {
  const sliders = [
    ['numClients','numClientsVal', v => v],
    ['numVehicles','numVehiclesVal', v => v],
    ['vehicleCapacity','vehicleCapacityVal', v => v],
    ['popSize','popSizeVal', v => v],
    ['maxGen','maxGenVal', v => v],
    ['mutRate','mutRateVal', v => v+'%'],
    ['eliteRate','eliteRateVal', v => v+'%'],
  ];
  sliders.forEach(([id, vid, fmt]) => {
    const el = document.getElementById(id);
    const vl = document.getElementById(vid);
    el.addEventListener('input', () => { vl.textContent = fmt(el.value); });
  });
}

function getParams() {
  return {
    numClients:      +document.getElementById('numClients').value,
    numVehicles:     +document.getElementById('numVehicles').value,
    vehicleCapacity: +document.getElementById('vehicleCapacity').value,
    popSize:         +document.getElementById('popSize').value,
    maxGen:          +document.getElementById('maxGen').value,
    mutRate:         +document.getElementById('mutRate').value / 100,
    eliteRate:       +document.getElementById('eliteRate').value / 100,
    speed:           +document.getElementById('speedSlider').value,
  };
}

// ---- Problem generation ----
function generateProblem(p) {
  depot = { x: 0.5, y: 0.5, label: 'D' };
  clients = Array.from({ length: p.numClients }, (_, i) => ({
    x: Math.random() * 0.85 + 0.075,
    y: Math.random() * 0.85 + 0.075,
    demand: Math.floor(Math.random() * 15) + 5,
    label: String(i + 1),
  }));
}

// ---- Distance ----
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---- Decode chromosome into routes ----
function decode(chrom, cap) {
  const routes = [];
  let route = [], load = 0;
  for (const idx of chrom) {
    const c = clients[idx];
    if (load + c.demand > cap && route.length > 0) {
      routes.push(route);
      route = []; load = 0;
    }
    route.push(idx);
    load += c.demand;
  }
  if (route.length) routes.push(route);
  return routes;
}

// ---- Fitness = 1 / total distance ----
function fitness(chrom, cap) {
  const routes = decode(chrom, cap);
  let total = 0;
  for (const r of routes) {
    let prev = depot;
    for (const idx of r) { total += dist(prev, clients[idx]); prev = clients[idx]; }
    total += dist(prev, depot);
  }
  return { fit: 1 / total, dist: total, routes };
}

// ---- Init population ----
function initPop(size, n) {
  return Array.from({ length: size }, () => shuffle(Array.from({ length: n }, (_, i) => i)));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- PMX Crossover ----
function pmx(p1, p2) {
  const n = p1.length;
  let a = Math.floor(Math.random() * n);
  let b = Math.floor(Math.random() * n);
  if (a > b) [a, b] = [b, a];
  const child = new Array(n).fill(-1);
  const map = {};
  for (let i = a; i <= b; i++) { child[i] = p1[i]; map[p1[i]] = p2[i]; }
  for (let i = 0; i < n; i++) {
    if (child[i] !== -1) continue;
    let val = p2[i];
    while (map[val] !== undefined) val = map[val];
    child[i] = val;
  }
  return child;
}

// ---- Mutação por swap ----
function mutate(chrom, rate) {
  const c = [...chrom];
  if (Math.random() < rate) {
    const i = Math.floor(Math.random() * c.length);
    const j = Math.floor(Math.random() * c.length);
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

// ---- Tournament selection ----
function select(pop, fits) {
  const a = Math.floor(Math.random() * pop.length);
  const b = Math.floor(Math.random() * pop.length);
  return fits[a].fit >= fits[b].fit ? pop[a] : pop[b];
}

// ---- One generation step ----
function step(pop, p) {
  // Evaluate each individual keeping index alignment with pop
  const evaluated = pop.map(c => ({ c, f: fitness(c, p.vehicleCapacity) }));
  evaluated.sort((a, b) => b.f.fit - a.f.fit);

  const eliteCount = Math.max(1, Math.round(p.popSize * p.eliteRate));
  const nextPop = evaluated.slice(0, eliteCount).map(x => [...x.c]);
  const sortedPop = evaluated.map(x => x.c);
  const sortedFit = evaluated.map(x => x.f);

  while (nextPop.length < p.popSize) {
    const p1 = select(sortedPop, sortedFit);
    const p2 = select(sortedPop, sortedFit);
    nextPop.push(mutate(pmx(p1, p2), p.mutRate));
  }

  const bestF = sortedFit[0];
  const avgDist = sortedFit.reduce((s, f) => s + f.dist, 0) / sortedFit.length;
  return { pop: nextPop, best: bestF, avgDist };
}

// ---- Canvas helpers ----
function canvasParentWidth(canvas) {
  const rect = canvas.parentElement.getBoundingClientRect();
  return rect.width > 0 ? Math.floor(rect.width) : (canvas.parentElement.offsetWidth || 700);
}

function resizeCanvases() {
  const mw = canvasParentWidth(mapCanvas);
  mapCanvas.width  = mw;
  mapCanvas.height = 420;

  const fw = canvasParentWidth(fitCanvas);
  fitCanvas.width  = fw;
  fitCanvas.height = 220;
}

function mapW() { return mapCanvas.width; }
function mapH() { return mapCanvas.height; }

function toCanvasXY(nx, ny) {
  const pad = 40;
  return { x: pad + nx * (mapW() - pad * 2), y: pad + ny * (mapH() - pad * 2) };
}

function drawMap(solution) {
  const W = mapW(), H = mapH();
  mapCtx.clearRect(0, 0, W, H);

  // Background
  mapCtx.fillStyle = 'rgba(0,0,0,0.25)';
  mapCtx.beginPath();
  mapCtx.roundRect(0, 0, W, H, 12);
  mapCtx.fill();

  if (!solution) { drawPlaceholder(); return; }

  const { routes } = solution;

  // Draw routes
  routes.forEach((route, ri) => {
    const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
    const depotP = toCanvasXY(depot.x, depot.y);
    mapCtx.beginPath();
    mapCtx.moveTo(depotP.x, depotP.y);
    for (const idx of route) {
      const p = toCanvasXY(clients[idx].x, clients[idx].y);
      mapCtx.lineTo(p.x, p.y);
    }
    mapCtx.lineTo(depotP.x, depotP.y);
    mapCtx.strokeStyle = color;
    mapCtx.lineWidth = 2;
    mapCtx.globalAlpha = 0.75;
    mapCtx.stroke();
    mapCtx.globalAlpha = 1;
  });

  // Draw clients
  clients.forEach((c, i) => {
    const p = toCanvasXY(c.x, c.y);
    // Find which route
    let routeIdx = -1;
    for (let r = 0; r < routes.length; r++) {
      if (routes[r].includes(i)) { routeIdx = r; break; }
    }
    const color = routeIdx >= 0 ? ROUTE_COLORS[routeIdx % ROUTE_COLORS.length] : '#8892b0';

    mapCtx.beginPath();
    mapCtx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    mapCtx.fillStyle = 'rgba(13,18,36,0.9)';
    mapCtx.fill();
    mapCtx.strokeStyle = color;
    mapCtx.lineWidth = 2.5;
    mapCtx.stroke();

    mapCtx.fillStyle = color;
    mapCtx.font = 'bold 8px Inter, sans-serif';
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';
    mapCtx.fillText(c.label, p.x, p.y);

    // demand label
    mapCtx.fillStyle = '#4a5568';
    mapCtx.font = '7px Inter, sans-serif';
    mapCtx.fillText('d:'+c.demand, p.x, p.y + 15);
  });

  // Draw depot
  const dp = toCanvasXY(depot.x, depot.y);
  mapCtx.beginPath();
  mapCtx.arc(dp.x, dp.y, 13, 0, Math.PI * 2);
  mapCtx.fillStyle = '#1e2540';
  mapCtx.fill();
  mapCtx.strokeStyle = '#f59e0b';
  mapCtx.lineWidth = 3;
  mapCtx.stroke();
  mapCtx.fillStyle = '#f59e0b';
  mapCtx.font = 'bold 10px Inter, sans-serif';
  mapCtx.textAlign = 'center';
  mapCtx.textBaseline = 'middle';
  mapCtx.fillText('D', dp.x, dp.y);

  // Legend
  buildLegend(routes);
}

function drawPlaceholder() {
  const W = mapW(), H = mapH();
  mapCtx.fillStyle = 'rgba(74,85,104,0.3)';
  mapCtx.font = '14px Inter, sans-serif';
  mapCtx.textAlign = 'center';
  mapCtx.textBaseline = 'middle';
  mapCtx.fillText('▶  Pressione "Iniciar Evolução" para visualizar o mapa', W/2, H/2);
}

function buildLegend(routes) {
  const leg = document.getElementById('routeLegend');
  leg.innerHTML = routes.map((_, i) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${ROUTE_COLORS[i % ROUTE_COLORS.length]}"></span>Rota ${i+1}</span>`
  ).join('');
}

// ---- Fitness chart ----
function drawChart() {
  const W = fitCanvas.width;
  const H = fitCanvas.height;
  fitCtx.clearRect(0, 0, W, H);
  if (!historyBest.length) return;

  const pad = { t: 16, r: 16, b: 36, l: 56 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const allVals = [...historyBest, ...historyAvg];
  const minV = Math.min(...allVals) * 0.95;
  const maxV = Math.max(...allVals) * 1.05;

  function gx(i) { return pad.l + (i / Math.max(historyBest.length - 1, 1)) * cW; }
  function gy(v) { return pad.t + cH - ((v - minV) / (maxV - minV)) * cH; }

  // Grid
  fitCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  fitCtx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (g / 4) * cH;
    fitCtx.beginPath(); fitCtx.moveTo(pad.l, y); fitCtx.lineTo(W - pad.r, y); fitCtx.stroke();
    const val = maxV - (g / 4) * (maxV - minV);
    fitCtx.fillStyle = '#4a5568';
    fitCtx.font = '9px JetBrains Mono, monospace';
    fitCtx.textAlign = 'right';
    fitCtx.fillText(val.toFixed(1), pad.l - 6, y + 3);
  }

  // Avg line
  fitCtx.beginPath();
  historyAvg.forEach((v, i) => i === 0 ? fitCtx.moveTo(gx(i), gy(v)) : fitCtx.lineTo(gx(i), gy(v)));
  fitCtx.strokeStyle = 'rgba(139,92,246,0.4)';
  fitCtx.lineWidth = 1.5;
  fitCtx.stroke();

  // Best line gradient fill
  fitCtx.beginPath();
  historyBest.forEach((v, i) => i === 0 ? fitCtx.moveTo(gx(i), gy(v)) : fitCtx.lineTo(gx(i), gy(v)));
  fitCtx.lineTo(gx(historyBest.length - 1), pad.t + cH);
  fitCtx.lineTo(gx(0), pad.t + cH);
  fitCtx.closePath();
  const grad = fitCtx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  grad.addColorStop(0, 'rgba(16,185,129,0.3)');
  grad.addColorStop(1, 'rgba(16,185,129,0)');
  fitCtx.fillStyle = grad;
  fitCtx.fill();

  fitCtx.beginPath();
  historyBest.forEach((v, i) => i === 0 ? fitCtx.moveTo(gx(i), gy(v)) : fitCtx.lineTo(gx(i), gy(v)));
  fitCtx.strokeStyle = '#10b981';
  fitCtx.lineWidth = 2;
  fitCtx.stroke();

  // Labels
  fitCtx.fillStyle = '#4a5568';
  fitCtx.font = '9px Inter, sans-serif';
  fitCtx.textAlign = 'center';
  const labelStep = Math.ceil(historyBest.length / 8);
  historyBest.forEach((_, i) => {
    if (i % labelStep === 0 || i === historyBest.length - 1) {
      fitCtx.fillText(i + 1, gx(i), H - 8);
    }
  });

  // Legend
  fitCtx.font = '9px Inter, sans-serif';
  fitCtx.fillStyle = '#10b981';
  fitCtx.textAlign = 'left';
  fitCtx.fillText('● Melhor', pad.l, pad.t - 2);
  fitCtx.fillStyle = 'rgba(139,92,246,0.8)';
  fitCtx.fillText('● Média', pad.l + 56, pad.t - 2);
}

// ---- Route Details ----
function renderRouteDetails(routes, cap) {
  const list = document.getElementById('routesList');
  if (!routes || !routes.length) { list.innerHTML = '<p class="placeholder-text">Execute o algoritmo para ver os detalhes das rotas aqui.</p>'; return; }
  list.innerHTML = routes.map((route, i) => {
    const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
    let d = 0, prev = depot;
    let load = 0;
    const labels = route.map(idx => { load += clients[idx].demand; return clients[idx].label; });
    for (const idx of route) { d += dist(prev, clients[idx]); prev = clients[idx]; }
    d += dist(prev, depot);
    const loadPct = Math.min(100, (load / cap) * 100);
    return `<div class="route-item" style="animation-delay:${i*0.06}s">
      <div class="route-color-bar" style="background:${color}"></div>
      <div class="route-info">
        <div class="route-title">Rota ${i+1} — Veículo ${i+1}</div>
        <div class="route-path">Depósito → ${labels.join(' → ')} → Depósito</div>
      </div>
      <div class="route-meta">
        <div class="route-dist">${(d*100).toFixed(1)} km</div>
        <div class="route-load">Carga: ${load}/${cap}</div>
        <div class="route-load-bar"><div class="route-load-fill" style="width:${loadPct}%;background:${loadPct>90?'#f43f5e':color}"></div></div>
      </div>
    </div>`;
  }).join('');
}

// ---- Stats UI ----
function updateStats(gen, best, avgDist, totalGen) {
  document.getElementById('statGen').textContent = gen;
  document.getElementById('statBest').textContent = (best.dist * 100).toFixed(1) + ' km';
  document.getElementById('statAvg').textContent = (avgDist * 100).toFixed(1) + ' km';
  document.getElementById('statVehicles').textContent = best.routes.length;
  const pct = Math.round((gen / totalGen) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
}

function setStatus(state, text) {
  const dot = document.querySelector('.status-dot');
  dot.className = 'status-dot ' + state;
  document.getElementById('statusText').textContent = text;
}

// ---- Main run loop ----
function runGA() {
  params = getParams();
  generateProblem(params);
  generation = 0;
  historyBest = []; historyAvg = [];
  bestSolution = null;

  resizeCanvases();
  drawMap(null);
  renderRouteDetails(null, params.vehicleCapacity);
  setStatus('running', 'Evoluindo população...');
  document.getElementById('btnRun').disabled = true;

  let pop = initPop(params.popSize, params.numClients);
  let stepResult;

  // speed 1 = ~30ms/gen, speed 10 = ~1ms/gen
  const delay = () => Math.max(1, Math.round(35 - (+document.getElementById('speedSlider').value - 1) * 3.5));

  function tick() {
    stepResult = step(pop, params);
    pop = stepResult.pop;
    generation++;

    historyBest.push(stepResult.best.dist);
    historyAvg.push(stepResult.avgDist);

    if (!bestSolution || stepResult.best.fit > (1 / bestSolution.dist)) {
      bestSolution = stepResult.best;
    }

    updateStats(generation, bestSolution, stepResult.avgDist, params.maxGen);
    drawMap(bestSolution);
    drawChart();
    renderRouteDetails(bestSolution.routes, params.vehicleCapacity);

    if (generation < params.maxGen && running) {
      rafId = setTimeout(() => requestAnimationFrame(tick), delay());
    } else {
      running = false;
      document.getElementById('btnRun').disabled = false;
      setStatus('done', `Concluído — ${params.maxGen} gerações`);
    }
  }

  running = true;
  requestAnimationFrame(tick);
}

// ---- Reset ----
function resetAll() {
  running = false;
  if (rafId) clearTimeout(rafId);
  generation = 0; historyBest = []; historyAvg = []; bestSolution = null;
  resizeCanvases();
  drawMap(null);
  drawChart();
  renderRouteDetails(null, 50);
  document.getElementById('statGen').textContent = '—';
  document.getElementById('statBest').textContent = '—';
  document.getElementById('statAvg').textContent = '—';
  document.getElementById('statVehicles').textContent = '—';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressPct').textContent = '0%';
  document.getElementById('btnRun').disabled = false;
  document.getElementById('routeLegend').innerHTML = '';
  setStatus('idle', 'Aguardando início');
}

// ---- Init ----
window.addEventListener('load', () => {
  initSliders();

  document.getElementById('btnRun').addEventListener('click', () => {
    if (running) return;
    runGA();
  });

  document.getElementById('btnReset').addEventListener('click', resetAll);

  // Defer canvas init until after first paint so clientWidth is available
  requestAnimationFrame(() => {
    resizeCanvases();
    drawMap(null);
    drawChart();
  });
});

window.addEventListener('resize', () => {
  resizeCanvases();
  drawMap(bestSolution || null);
  drawChart();
});
