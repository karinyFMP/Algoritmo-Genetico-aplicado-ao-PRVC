// src/main.js — Vite frontend entry point
import './style.css';
import { drawMap, drawChart, renderRouteDetails, resizeCanvas } from './render.js';

// ── DOM refs ──────────────────────────────────────────────────
const mapCanvas  = document.getElementById('mapCanvas');
const fitCanvas  = document.getElementById('fitnessChart');
const btnRun     = document.getElementById('btnRun');
const btnReset   = document.getElementById('btnReset');

// ── App state ─────────────────────────────────────────────────
let histBest = [], histAvg = [], clients = null, depot = null;
let currentSSE = null, running = false;

// ── Slider bindings ───────────────────────────────────────────
const sliders = [
  ['numClients',      'numClientsVal',      v => v],
  ['vehicleCapacity', 'vehicleCapacityVal', v => v],
  ['popSize',         'popSizeVal',         v => v],
  ['maxGen',          'maxGenVal',          v => v],
  ['mutRate',         'mutRateVal',         v => v + '%'],
  ['eliteRate',       'eliteRateVal',       v => v + '%'],
];
sliders.forEach(([id, vid, fmt]) => {
  const el = document.getElementById(id);
  const vl = document.getElementById(vid);
  if (el && vl) el.addEventListener('input', () => (vl.textContent = fmt(el.value)));
});

function getVal(id) { return +document.getElementById(id).value; }

// ── Status helpers ────────────────────────────────────────────
function setStatus(state, text) {
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + state;
  document.getElementById('statusText').textContent = text;
}

function updateStats(gen, maxGen, bestDist, avgDist, routes) {
  document.getElementById('statGen').textContent   = gen;
  document.getElementById('statBest').textContent  = (bestDist * 100).toFixed(1) + ' km';
  document.getElementById('statAvg').textContent   = (avgDist  * 100).toFixed(1) + ' km';
  document.getElementById('statRoutes').textContent = routes?.length ?? '—';
  const pct = Math.round((gen / maxGen) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent  = pct + '%';
}

function showServerInfo(jobId) {
  const info = document.getElementById('serverInfo');
  if (!info) return;
  info.style.display = 'block';
  document.getElementById('serverJobId').textContent  = jobId.slice(0, 8) + '…';
  document.getElementById('serverStream').textContent = `/api/ga/stream/${jobId.slice(0, 8)}…`;
}

// ── Canvas resize ─────────────────────────────────────────────
function resizeAll() {
  resizeCanvas(mapCanvas, 420);
  resizeCanvas(fitCanvas, 220);
}

// ── Reset UI ──────────────────────────────────────────────────
function resetUI() {
  if (currentSSE) { currentSSE.close(); currentSSE = null; }
  running = false;
  histBest = []; histAvg = []; clients = null; depot = null;
  resizeAll();
  drawMap(mapCanvas, null, null, null);
  drawChart(fitCanvas, [], []);
  renderRouteDetails(null, null, null, 50);
  document.getElementById('statGen').textContent    = '—';
  document.getElementById('statBest').textContent   = '—';
  document.getElementById('statAvg').textContent    = '—';
  document.getElementById('statRoutes').textContent = '—';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressPct').textContent  = '0%';
  document.getElementById('routeLegend').innerHTML  = '';
  const info = document.getElementById('serverInfo');
  if (info) info.style.display = 'none';
  btnRun.disabled = false;
  setStatus('idle', 'Aguardando início');
}

// ── Start GA run ──────────────────────────────────────────────
async function startRun() {
  if (running) return;
  running = true;
  btnRun.disabled = true;
  histBest = []; histAvg = [];

  const params = {
    numClients:      getVal('numClients'),
    vehicleCapacity: getVal('vehicleCapacity'),
    popSize:         getVal('popSize'),
    maxGen:          getVal('maxGen'),
    mutRate:         getVal('mutRate') / 100,
    eliteRate:       getVal('eliteRate') / 100,
  };

  setStatus('connecting', 'Conectando ao servidor…');

  let jobId;
  try {
    const res = await fetch('/api/ga/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    jobId   = data.jobId;
    clients = data.clients;
    depot   = data.depot;
  } catch (err) {
    setStatus('error', `Erro ao iniciar: ${err.message}`);
    running = false;
    btnRun.disabled = false;
    return;
  }

  showServerInfo(jobId);
  resizeAll();
  drawMap(mapCanvas, null, clients, depot);
  setStatus('running', 'Evoluindo no servidor…');

  // Connect SSE
  const sse = new EventSource(`/api/ga/stream/${jobId}`);
  currentSSE = sse;

  sse.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.error) {
      setStatus('error', d.error);
      sse.close();
      running = false;
      btnRun.disabled = false;
      return;
    }

    histBest.push(d.bestDist);
    histAvg.push(d.avgDist);

    updateStats(d.generation, d.maxGen, d.bestDist, d.avgDist, d.bestRoutes);
    drawMap(mapCanvas, { routes: d.bestRoutes }, d.clients, d.depot);
    drawChart(fitCanvas, histBest, histAvg);
    renderRouteDetails(d.bestRoutes, d.clients, d.depot, params.vehicleCapacity);

    if (d.done) {
      setStatus('done', `Concluído — ${d.maxGen} gerações`);
      running = false;
      btnRun.disabled = false;
      sse.close();
      currentSSE = null;
    }
  };

  sse.onerror = () => {
    if (!running) return;
    setStatus('error', 'Conexão SSE encerrada');
    running = false;
    btnRun.disabled = false;
    sse.close();
    currentSSE = null;
  };
}

// ── Event listeners ───────────────────────────────────────────
btnRun.addEventListener('click', startRun);
btnReset.addEventListener('click', resetUI);
window.addEventListener('resize', () => {
  resizeAll();
  if (clients) drawMap(mapCanvas, null, clients, depot);
  drawChart(fitCanvas, histBest, histAvg);
});

// ── Init ──────────────────────────────────────────────────────
requestAnimationFrame(() => {
  resizeAll();
  drawMap(mapCanvas, null, null, null);
  drawChart(fitCanvas, [], []);
});
