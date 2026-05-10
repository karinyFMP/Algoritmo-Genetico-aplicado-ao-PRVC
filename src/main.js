// src/main.js — Controlador principal do Simulador AG/PRVC
//
// ╔══════════════════════════════════════════════════════════╗
// ║  Commit: main: sistema de playback buffer com SSE        ║
// ║  Separa o recebimento SSE da renderização visual.        ║
// ║  O SSE preenche historyBuffer[]; o loop de playback lê   ║
// ║  esse buffer de forma completamente independente.        ║
// ╚══════════════════════════════════════════════════════════╝
//
// APRESENTAÇÃO (banca): mostrar o array historyBuffer a crescer
// na consola enquanto o GA corre — prova que o buffer funciona.
import './style.css';
import { drawMap, drawChart, renderRouteDetails, resizeCanvas } from './render.js';

// ══════════════════════════════════════════════════════════════
//  ESTADO GLOBAL DO SIMULADOR
// ══════════════════════════════════════════════════════════════

// Buffer de todas as gerações recebidas via SSE
// PONTO DE ATENÇÃO (banca): o SSE preenche este array; o playback
// loop lê dele de forma independente.
let historyBuffer = [];

// Frame atual sendo exibido (índice em historyBuffer)
let currentFrame = 0;

// Estado do playback
let isPlaying    = false;
let playbackSpeed = 3;        // 1=muito lento … 5=muito rápido
let playbackTimer = null;     // handle do setTimeout
let dashOffset    = 0;        // offset dos Marching Ants (animado via rAF)
let animFrameId   = null;     // id do requestAnimationFrame

// Estado do SSE / servidor
let currentSSE = null;
let running    = false;
let clients    = null;
let depot      = null;
let params     = {};
let histBest   = [], histAvg = [];

// Velocidade em ms por frame para cada nível do slider
// APRESENTAÇÃO (banca): 0.25x = muito lento (bom para explicar cada geração)
//                       1x   = ritmo normal de demonstração
//                       2x   = rápido para mostrar convergência geral
const SPEED_MAP = {
  1: 900,   // 0.25x — explicar gene a gene à banca
  2: 400,   // 0.5x  — ritmo lento mas fluido
  3: 150,   // 1x    — velocidade de referência
  4: 60,    // 1.5x  — observar convergência
  5: 20,    // 2x    — varredura rápida de todas as gerações
};
const SPEED_LABEL = {
  1: '0.25x', 2: '0.5x', 3: '1x', 4: '1.5x', 5: '2x',
};

// ── Refs DOM ──────────────────────────────────────────────────
const mapCanvas    = document.getElementById('mapCanvas');
const fitCanvas    = document.getElementById('fitnessChart');
const btnRun       = document.getElementById('btnRun');
const btnReset     = document.getElementById('btnReset');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnStepFwd   = document.getElementById('btnStepFwd');
const btnStepBack  = document.getElementById('btnStepBack');
const speedSlider  = document.getElementById('speedSlider');
const speedLabel   = document.getElementById('speedLabel');
const iconPlay     = document.getElementById('iconPlay');
const iconPause    = document.getElementById('iconPause');
const timelineTrack    = document.getElementById('timelineTrack');
const timelineProgress = document.getElementById('timelineProgress');
const timelineThumb    = document.getElementById('timelineThumb');
const timelineEnd      = document.getElementById('timelineEnd');

// ══════════════════════════════════════════════════════════════
//  SLIDERS DE PARÂMETROS
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
//  HELPERS DE STATUS / UI
// ══════════════════════════════════════════════════════════════
function setStatus(state, text) {
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + state;
  document.getElementById('statusText').textContent = text;
}

function resizeAll() {
  resizeCanvas(mapCanvas, 440);
  resizeCanvas(fitCanvas, 200);
}

// ══════════════════════════════════════════════════════════════
//  Commit: main: sistema de playback buffer com SSE
//  SISTEMA DE PLAYBACK
//  APRESENTAÇÃO (banca): play/pause, step e scrubber
//  controlam currentFrame independentemente do SSE.
//  Mesmo com a simulação pausada, o loop Marching Ants
//  continua a correr via requestAnimationFrame (ver antLoop).
// ══════════════════════════════════════════════════════════════

/** Renderiza o frame no índice `idx` do historyBuffer */
function renderFrame(idx) {
  if (!historyBuffer.length) return;
  const frame = historyBuffer[Math.min(idx, historyBuffer.length - 1)];
  if (!frame) return;

  const prevFrame = idx > 0 ? historyBuffer[idx - 1] : null;
  const evolved = prevFrame && frame.bestDist < prevFrame.bestDist;

  // Mapa principal (com dashOffset para Marching Ants)
  drawMap(mapCanvas, { routes: frame.bestRoutes }, frame.clients, frame.depot, dashOffset);

  // Gráfico com marcador de frame atual
  drawChart(fitCanvas, histBest.slice(0, idx + 1), histAvg.slice(0, idx + 1), idx);

  // Detalhes das rotas
  renderRouteDetails(frame.bestRoutes, frame.clients, frame.depot, params.vehicleCapacity);

  // Stats do frame
  updateStats(frame, evolved);

  // HUD Genético
  updateHUD(frame, evolved);

  // Timeline
  updateTimeline(idx);
}

/** Avança um frame e agenda o próximo se estiver em play */
function advanceFrame() {
  if (currentFrame < historyBuffer.length - 1) {
    currentFrame++;
    renderFrame(currentFrame);
  }
  if (isPlaying) {
    if (currentFrame >= historyBuffer.length - 1 && !running) {
      // Chegou ao fim e SSE encerrou — para
      pausePlayback();
      setStatus('done', `Concluído — ${historyBuffer.length} gerações`);
    } else {
      playbackTimer = setTimeout(advanceFrame, SPEED_MAP[playbackSpeed]);
    }
  }
}

function startPlayback() {
  if (isPlaying) return;
  isPlaying = true;
  iconPlay.style.display  = 'none';
  iconPause.style.display = 'block';
  document.getElementById('miniStatusDot').classList.add('playing');
  playbackTimer = setTimeout(advanceFrame, SPEED_MAP[playbackSpeed]);
}

function pausePlayback() {
  isPlaying = false;
  clearTimeout(playbackTimer);
  iconPlay.style.display  = 'block';
  iconPause.style.display = 'none';
  document.getElementById('miniStatusDot').classList.remove('playing');
}

function stepForward() {
  pausePlayback();
  if (currentFrame < historyBuffer.length - 1) {
    currentFrame++;
    renderFrame(currentFrame);
  }
}

function stepBackward() {
  pausePlayback();
  if (currentFrame > 0) {
    currentFrame--;
    renderFrame(currentFrame);
  }
}

function seekToFrame(idx) {
  pausePlayback();
  currentFrame = Math.max(0, Math.min(idx, historyBuffer.length - 1));
  renderFrame(currentFrame);
}

// ── Marching Ants loop (RAF independente do playback) ──────────
// Commit: render: marching ants, warehouse e glow nas rotas
//
// APRESENTAÇÃO (banca): este loop corre a 60 fps SEMPRE —
// mesmo quando a simulação está em pausa. Só actualiza dashOffset.
// O renderFrame (chamado pelo playback) usa esse valor para
// desenhar as linhas animadas. É a separação de concerns:
//   antLoop  → anima as formigas (RAF, 60fps)
//   advanceFrame → avança gerações (setTimeout, velocidade variável)
function antLoop() {
  dashOffset = (dashOffset + 0.5) % 60;
  // Re-renderiza mapa com novo offset se existe frame activo
  if (historyBuffer.length && clients) {
    const frame = historyBuffer[currentFrame];
    if (frame) {
      drawMap(mapCanvas, { routes: frame.bestRoutes }, frame.clients, frame.depot, dashOffset);
    }
  }
  animFrameId = requestAnimationFrame(antLoop);
}

// ══════════════════════════════════════════════════════════════
//  ATUALIZAÇÃO DE STATS
// ══════════════════════════════════════════════════════════════
function updateStats(frame, evolved) {
  document.getElementById('statGen').textContent    = frame.generation;
  document.getElementById('statBest').textContent   = (frame.bestDist * 100).toFixed(1) + ' km';
  document.getElementById('statAvg').textContent    = (frame.avgDist  * 100).toFixed(1) + ' km';
  document.getElementById('statRoutes').textContent = frame.bestRoutes?.length ?? '—';
  document.getElementById('statBuffer').textContent = `${historyBuffer.length} / ${frame.maxGen}`;

  // Capacidade média utilizada — nova métrica
  // PONTO DE ATENÇÃO (banca): mostra quanto cada veículo está carregado em média
  if (frame.bestRoutes && frame.clients && params.vehicleCapacity) {
    const cap = params.vehicleCapacity;
    const avgLoad = frame.bestRoutes.reduce((sum, route) => {
      const load = route.reduce((s, idx) => s + frame.clients[idx].demand, 0);
      return sum + load;
    }, 0) / frame.bestRoutes.length;
    const pct = ((avgLoad / cap) * 100).toFixed(0);
    document.getElementById('statCapAvg').textContent = `${pct}%`;
  }

  const pct = Math.round((frame.generation / frame.maxGen) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent  = pct + '%';

  // Mini status
  document.getElementById('miniStatusGen').textContent =
    `Gen ${frame.generation} / ${frame.maxGen}`;
}

// ══════════════════════════════════════════════════════════════
//  Commit: frontend: novo index.html com playback e HUD genetico
//  HUD GENÉTICO
//  APRESENTAÇÃO (banca): o cromossomo é um array de índices de
//  clientes (permutação). A função decode() no servidor percorre
//  esse array e insere um "|" sempre que adicionar o próximo
//  cliente excederia a capacidade do veículo (ex: cap = 50).
//  Permite mostrar à banca como o gene codifica múltiplas rotas.
// ══════════════════════════════════════════════════════════════
function updateHUD(frame, evolved) {
  const hudEl    = document.getElementById('hudGenetic');
  const vecEl    = document.getElementById('chromVector');
  const genLabel = document.getElementById('hudGenLabel');
  const fitLabel = document.getElementById('hudFitLabel');
  const evoBadge = document.getElementById('hudEvolution');

  genLabel.textContent = `Gen: ${frame.generation}`;
  fitLabel.textContent = `Dist: ${(frame.bestDist * 100).toFixed(1)} km`;

  // Renderiza vetor do cromossomo com separadores de rota
  if (frame.bestChrom && frame.clients && params.vehicleCapacity) {
    const cap   = params.vehicleCapacity;
    const chrom = frame.bestChrom;
    let html    = '';
    let load    = 0;
    let first   = true;

    chrom.forEach(idx => {
      const demand = frame.clients[idx].demand;
      // Estourou capacidade → novo veículo (separador)
      if (!first && load + demand > cap) {
        html += `<span class="chrom-separator">|</span>`;
        load = 0;
      }
      html += `<span class="chrom-gene">${frame.clients[idx].label}</span>`;
      load += demand;
      first = false;
    });

    vecEl.innerHTML = html;
  } else {
    vecEl.innerHTML = '<span class="chrom-placeholder">Aguardando dados...</span>';
  }

  // Flash verde quando nova solução ótima encontrada
  if (evolved) {
    evoBadge.classList.remove('hidden');
    hudEl.classList.add('evolved');
    setTimeout(() => {
      evoBadge.classList.add('hidden');
      hudEl.classList.remove('evolved');
    }, 2000);
  }
}

// ══════════════════════════════════════════════════════════════
//  TIMELINE / SCRUBBER
// ══════════════════════════════════════════════════════════════
function updateTimeline(idx) {
  const total = Math.max(1, historyBuffer.length - 1);
  const pct   = (idx / total) * 100;
  timelineProgress.style.width = pct + '%';
  timelineThumb.style.left     = pct + '%';
  timelineEnd.textContent      = historyBuffer.length;
  document.getElementById('timelineStart').textContent = 1;
}

// Drag na timeline
let isDraggingTimeline = false;

function timelineSeek(e) {
  const rect = timelineTrack.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const idx  = Math.round(pct * (historyBuffer.length - 1));
  seekToFrame(idx);
}

timelineTrack.addEventListener('mousedown', e => {
  isDraggingTimeline = true;
  timelineSeek(e);
});
window.addEventListener('mousemove', e => {
  if (isDraggingTimeline) timelineSeek(e);
});
window.addEventListener('mouseup', () => { isDraggingTimeline = false; });

// Touch support
timelineTrack.addEventListener('touchstart', e => {
  isDraggingTimeline = true;
  timelineSeek(e.touches[0]);
}, { passive: true });
window.addEventListener('touchmove', e => {
  if (isDraggingTimeline) timelineSeek(e.touches[0]);
}, { passive: true });
window.addEventListener('touchend', () => { isDraggingTimeline = false; });

// ══════════════════════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════════════════════
function resetUI() {
  if (currentSSE) { currentSSE.close(); currentSSE = null; }
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  pausePlayback();

  running = false;
  historyBuffer = []; histBest = []; histAvg = [];
  clients = null; depot = null; currentFrame = 0; dashOffset = 0;

  resizeAll();
  drawMap(mapCanvas, null, null, null, 0);
  drawChart(fitCanvas, [], []);
  renderRouteDetails(null, null, null, 50);

  document.getElementById('statGen').textContent    = '—';
  document.getElementById('statBest').textContent   = '—';
  document.getElementById('statAvg').textContent    = '—';
  document.getElementById('statRoutes').textContent = '—';
  document.getElementById('statCapAvg').textContent = '—';
  document.getElementById('statBuffer').textContent = '0 / 0';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressPct').textContent  = '0%';
  document.getElementById('routeLegend').innerHTML    = '';
  document.getElementById('miniStatusGen').textContent = 'Gen 0 / 0';
  document.getElementById('chromVector').innerHTML =
    '<span class="chrom-placeholder">Aguardando dados...</span>';

  const info = document.getElementById('serverInfo');
  if (info) info.style.display = 'none';

  timelineProgress.style.width = '0%';
  timelineThumb.style.left     = '0%';
  timelineEnd.textContent      = '0';

  btnRun.disabled = false;
  setStatus('idle', 'Aguardando início');
}

// ══════════════════════════════════════════════════════════════
//  Commit: main: sistema de playback buffer com SSE
//  INICIAR RUN — POST + SSE → preenchimento do historyBuffer
//  APRESENTAÇÃO (banca): o fluxo tem duas fases independentes:
//    Fase 1 (SSE)     → preenche historyBuffer[] em background
//    Fase 2 (Playback)→ lê historyBuffer[] ao ritmo do slider
//  O playback arranca automaticamente após 3 frames no buffer.
// ══════════════════════════════════════════════════════════════
async function startRun() {
  if (running) return;
  running = true;
  btnRun.disabled = true;
  historyBuffer = []; histBest = []; histAvg = [];
  currentFrame = 0;

  params = {
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
    jobId  = data.jobId;
    clients = data.clients;
    depot   = data.depot;
  } catch (err) {
    setStatus('error', `Erro ao iniciar: ${err.message}`);
    running = false;
    btnRun.disabled = false;
    return;
  }

  // Mostra info do servidor
  const info = document.getElementById('serverInfo');
  if (info) info.style.display = 'block';
  document.getElementById('serverJobId').textContent  = jobId.slice(0, 8) + '…';
  document.getElementById('serverStream').textContent = `/api/ga/stream/${jobId.slice(0, 8)}…`;

  resizeAll();
  drawMap(mapCanvas, null, clients, depot, 0);
  setStatus('buffering', 'Recebendo gerações…');

  // Inicia o loop de Marching Ants (roda independentemente)
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(antLoop);

  // ── Conecta ao SSE ─────────────────────────────────────────
  const sse = new EventSource(`/api/ga/stream/${jobId}`);
  currentSSE = sse;

  sse.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.error) {
      setStatus('error', d.error);
      sse.close(); running = false; btnRun.disabled = false;
      return;
    }

    // Armazena no buffer (não renderiza imediatamente)
    historyBuffer.push(d);
    histBest.push(d.bestDist);
    histAvg.push(d.avgDist);

    // Após 3 frames no buffer, inicia playback automaticamente
    if (historyBuffer.length === 3 && !isPlaying) {
      setStatus('running', 'Reproduzindo simulação…');
      startPlayback();
    }

    if (d.done) {
      running = false;
      btnRun.disabled = false;
      sse.close();
      currentSSE = null;
      // Se ainda estiver buffering, inicia playback agora
      if (!isPlaying) {
        setStatus('running', 'Reproduzindo simulação…');
        startPlayback();
      }
    }
  };

  sse.onerror = () => {
    if (!running) return;
    setStatus('error', 'Conexão SSE encerrada');
    running = false; btnRun.disabled = false;
    sse.close(); currentSSE = null;
  };
}

// ══════════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════════════════
btnRun.addEventListener('click', startRun);
btnReset.addEventListener('click', resetUI);

btnPlayPause.addEventListener('click', () => {
  if (isPlaying) pausePlayback();
  else if (historyBuffer.length) startPlayback();
});

btnStepFwd.addEventListener('click', stepForward);
btnStepBack.addEventListener('click', stepBackward);

// Atalhos de teclado
// APRESENTAÇÃO (banca): Espaço = play/pause | ← → = step frame a frame
// Ideal para apresentar à banca geração a geração sem tocar no rato.
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space')       { e.preventDefault(); btnPlayPause.click(); }
  if (e.code === 'ArrowRight')  { e.preventDefault(); stepForward(); }
  if (e.code === 'ArrowLeft')   { e.preventDefault(); stepBackward(); }
});

// Slider de velocidade
speedSlider.addEventListener('input', () => {
  playbackSpeed = +speedSlider.value;
  speedLabel.textContent = SPEED_LABEL[playbackSpeed];
  // Se estiver rodando, reinicia o timer com nova velocidade
  if (isPlaying) {
    clearTimeout(playbackTimer);
    playbackTimer = setTimeout(advanceFrame, SPEED_MAP[playbackSpeed]);
  }
});

// Resize
window.addEventListener('resize', () => {
  resizeAll();
  if (historyBuffer.length) renderFrame(currentFrame);
  else { drawMap(mapCanvas, null, clients, depot, 0); drawChart(fitCanvas, [], []); }
});

// ── Init ──────────────────────────────────────────────────────
requestAnimationFrame(() => {
  resizeAll();
  drawMap(mapCanvas, null, null, null, 0);
  drawChart(fitCanvas, [], []);
  speedLabel.textContent = SPEED_LABEL[playbackSpeed];
});
