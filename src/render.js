// src/render.js — Canvas drawing module (browser only)

export const ROUTE_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4',
  '#a78bfa', '#34d399', '#fb923c', '#38bdf8', '#e879f9',
];

// ── Canvas sizing ──────────────────────────────────────────────
export function resizeCanvas(canvas, h) {
  const w = canvas.parentElement.getBoundingClientRect().width || canvas.parentElement.offsetWidth || 700;
  canvas.width = Math.floor(w);
  canvas.height = h;
}

// ── Map drawing ────────────────────────────────────────────────
export function drawMap(canvas, solution, clients, depot) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Dark tinted background
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 0, W, H);

  if (!solution || !clients) {
    drawPlaceholder(ctx, W, H);
    return;
  }

  const pad = 44;
  function toXY(nx, ny) {
    return { x: pad + nx * (W - pad * 2), y: pad + ny * (H - pad * 2) };
  }

  const { routes } = solution;

  // Draw route lines
  routes.forEach((route, ri) => {
    const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
    const dp = toXY(depot.x, depot.y);
    ctx.beginPath();
    ctx.moveTo(dp.x, dp.y);
    route.forEach(idx => {
      const p = toXY(clients[idx].x, clients[idx].y);
      ctx.lineTo(p.x, p.y);
    });
    ctx.lineTo(dp.x, dp.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.72;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Draw client nodes
  clients.forEach((c, i) => {
    const p = toXY(c.x, c.y);
    let ri = routes.findIndex(r => r.includes(i));
    const color = ri >= 0 ? ROUTE_COLORS[ri % ROUTE_COLORS.length] : '#8892b0';

    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(13,18,36,0.92)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.label, p.x, p.y);

    ctx.fillStyle = '#4a5568';
    ctx.font = '7px Inter, sans-serif';
    ctx.fillText('d:' + c.demand, p.x, p.y + 15);
  });

  // Draw depot
  const dp = toXY(depot.x, depot.y);
  ctx.beginPath();
  ctx.arc(dp.x, dp.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#1e2540';
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('D', dp.x, dp.y);

  buildLegend(routes);
}

function drawPlaceholder(ctx, W, H) {
  ctx.fillStyle = 'rgba(74,85,104,0.28)';
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('▶  Pressione "Iniciar Evolução" para visualizar o mapa', W / 2, H / 2);
}

function buildLegend(routes) {
  const leg = document.getElementById('routeLegend');
  if (!leg) return;
  leg.innerHTML = routes
    .map((_, i) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${ROUTE_COLORS[i % ROUTE_COLORS.length]}"></span>Rota ${i + 1}</span>`
    )
    .join('');
}

// ── Fitness chart ──────────────────────────────────────────────
export function drawChart(canvas, histBest, histAvg) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!histBest.length) return;

  const pad = { t: 20, r: 16, b: 36, l: 60 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const all = [...histBest, ...histAvg];
  const minV = Math.min(...all) * 0.95;
  const maxV = Math.max(...all) * 1.05;
  const n = histBest.length;

  const gx = i => pad.l + (i / Math.max(n - 1, 1)) * cW;
  const gy = v => pad.t + cH - ((v - minV) / (maxV - minV)) * cH;

  // Horizontal grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (g / 4) * cH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    const val = maxV - (g / 4) * (maxV - minV);
    ctx.fillStyle = '#4a5568';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(2), pad.l - 6, y + 3);
  }

  // Avg line (purple)
  ctx.beginPath();
  histAvg.forEach((v, i) => i === 0 ? ctx.moveTo(gx(i), gy(v)) : ctx.lineTo(gx(i), gy(v)));
  ctx.strokeStyle = 'rgba(139,92,246,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Best fill + line (green)
  ctx.beginPath();
  histBest.forEach((v, i) => i === 0 ? ctx.moveTo(gx(i), gy(v)) : ctx.lineTo(gx(i), gy(v)));
  ctx.lineTo(gx(n - 1), pad.t + cH);
  ctx.lineTo(gx(0), pad.t + cH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  grad.addColorStop(0, 'rgba(16,185,129,0.28)');
  grad.addColorStop(1, 'rgba(16,185,129,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  histBest.forEach((v, i) => i === 0 ? ctx.moveTo(gx(i), gy(v)) : ctx.lineTo(gx(i), gy(v)));
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.stroke();

  // X labels
  ctx.fillStyle = '#4a5568';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.ceil(n / 8);
  histBest.forEach((_, i) => {
    if (i % step === 0 || i === n - 1) ctx.fillText(i + 1, gx(i), H - 8);
  });

  // Legend
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#10b981';
  ctx.fillText('● Melhor', pad.l, pad.t - 4);
  ctx.fillStyle = 'rgba(139,92,246,0.9)';
  ctx.fillText('● Média', pad.l + 60, pad.t - 4);
}

// ── Route details ──────────────────────────────────────────────
export function renderRouteDetails(routes, clients, depot, cap) {
  const list = document.getElementById('routesList');
  if (!list) return;
  if (!routes?.length) {
    list.innerHTML = '<p class="placeholder-text">Execute o algoritmo para ver os detalhes das rotas.</p>';
    return;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  list.innerHTML = routes.map((route, i) => {
    const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
    let d = 0, prev = depot, load = 0;
    const labels = route.map(idx => {
      load += clients[idx].demand;
      return clients[idx].label;
    });
    route.forEach(idx => { d += dist(prev, clients[idx]); prev = clients[idx]; });
    d += dist(prev, depot);
    const pct = Math.min(100, (load / cap) * 100);
    return `<div class="route-item" style="animation-delay:${i * 0.06}s">
      <div class="route-color-bar" style="background:${color}"></div>
      <div class="route-info">
        <div class="route-title">Rota ${i + 1} — Veículo ${i + 1}</div>
        <div class="route-path">Depósito → ${labels.join(' → ')} → Depósito</div>
      </div>
      <div class="route-meta">
        <div class="route-dist">${(d * 100).toFixed(1)} km</div>
        <div class="route-load">Carga: ${load}/${cap}</div>
        <div class="route-load-bar"><div class="route-load-fill" style="width:${pct}%;background:${pct > 90 ? '#f43f5e' : color}"></div></div>
      </div>
    </div>`;
  }).join('');
}
