// src/render.js — Módulo de renderização Canvas (Simulador Didático AG/PRVC)
// PONTO DE ATENÇÃO (banca): toda a visualização do mapa acontece aqui.
// Marching Ants + Glow Neon + Warehouse + Clientes com demanda visual.

// ── Paleta de rotas (neon) ──────────────────────────────────────
export const ROUTE_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4',
  '#a78bfa', '#34d399', '#fb923c', '#38bdf8', '#e879f9',
];

// ── Canvas sizing ───────────────────────────────────────────────
export function resizeCanvas(canvas, h) {
  const w = canvas.parentElement?.getBoundingClientRect().width
    || canvas.parentElement?.offsetWidth || 700;
  canvas.width  = Math.floor(w);
  canvas.height = h;
}

// ── Coordenada normalizada → pixel ──────────────────────────────
function toXY(nx, ny, W, H, pad = 50) {
  return {
    x: pad + nx * (W - pad * 2),
    y: pad + ny * (H - pad * 2),
  };
}

// ════════════════════════════════════════════════════════════════
//  drawMap — renderização principal do mapa
//  PONTO DE ATENÇÃO (banca): dashOffset é incrementado a cada frame
//  para criar o efeito "Marching Ants" nas rotas (ilusão de caminhões).
// ════════════════════════════════════════════════════════════════
export function drawMap(canvas, solution, clients, depot, dashOffset = 0) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Fundo gradiente escuro
  const bgGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H)*0.7);
  bgGrad.addColorStop(0, 'rgba(17,24,39,0.96)');
  bgGrad.addColorStop(1, 'rgba(8,13,26,0.98)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Grade sutil de fundo (estética tech)
  drawGrid(ctx, W, H);

  if (!solution || !clients) {
    drawPlaceholder(ctx, W, H);
    return;
  }

  const { routes } = solution;

  // ── 1. Desenha linhas das rotas (Marching Ants + Glow) ────────
  routes.forEach((route, ri) => {
    const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
    const dp = toXY(depot.x, depot.y, W, H);

    // Coleta pontos da rota: depósito → clientes → depósito
    const pts = [dp, ...route.map(idx => toXY(clients[idx].x, clients[idx].y, W, H)), dp];

    // -- Glow neon (sombra difusa) --
    ctx.save();
    ctx.shadowColor  = color;
    ctx.shadowBlur   = 18;
    ctx.strokeStyle  = color;
    ctx.lineWidth    = 2.5;
    ctx.globalAlpha  = 0.55;
    // Marching Ants: setLineDash + dashOffset animado via parâmetro
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -dashOffset;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();

    // -- Linha base sólida (mais fina, menos opaca) --
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.2;
    ctx.globalAlpha = 0.2;
    ctx.setLineDash([]);
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  });

  // ── 2. Desenha clientes (caixa/construção com demanda) ─────────
  // PONTO DE ATENÇÃO (banca): cada cliente mostra a demanda como
  // barra de progresso visual (quanto do caminhão ele ocupa).
  clients.forEach((c, i) => {
    const p = toXY(c.x, c.y, W, H);
    const ri = routes.findIndex(r => r.includes(i));
    const color = ri >= 0 ? ROUTE_COLORS[ri % ROUTE_COLORS.length] : '#475569';
    drawClientNode(ctx, p.x, p.y, c.label, c.demand, color);
  });

  // ── 3. Desenha o Depósito (Warehouse pulsante) ─────────────────
  // PONTO DE ATENÇÃO (banca): o depósito é o ponto central do PRVC.
  // O anel pulsante é simulado com um gradiente radial externo.
  const dp = toXY(depot.x, depot.y, W, H);
  drawWarehouse(ctx, dp.x, dp.y, dashOffset);

  // ── 4. Legenda lateral das rotas ──────────────────────────────
  buildLegend(routes);
}

// ── Grid sutil de fundo ─────────────────────────────────────────
function drawGrid(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(99,102,241,0.04)';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();
}

// ── Cliente: caixa/pacote com label e barra de demanda ──────────
function drawClientNode(ctx, x, y, label, demand, color) {
  const S = 11; // metade do tamanho da caixa

  ctx.save();

  // Sombra colorida
  ctx.shadowColor = color;
  ctx.shadowBlur  = 10;

  // Caixa principal
  ctx.fillStyle = 'rgba(13,18,36,0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  roundRect(ctx, x - S, y - S, S * 2, S * 2, 4);
  ctx.fill();
  ctx.stroke();

  // Rótulo do cliente (número)
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.font = 'bold 9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);

  ctx.restore();

  // Barra de demanda abaixo do nó
  // Demanda máxima estimada ≈ 20 (conforme ga-engine: demand ∈ [5,19])
  const barW = S * 2 + 2;
  const barH = 3;
  const barX = x - S - 1;
  const barY = y + S + 4;
  const pct  = Math.min(1, demand / 19);

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.75;
  roundRect(ctx, barX, barY, barW * pct, barH, barH / 2);
  ctx.fill();
  ctx.restore();

  // Valor da demanda
  ctx.save();
  ctx.fillStyle = 'rgba(100,116,139,0.9)';
  ctx.font = '7px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('d:' + demand, x, barY + barH + 2);
  ctx.restore();
}

// ── Depósito: Warehouse com anel pulsante ───────────────────────
function drawWarehouse(ctx, x, y, dashOffset) {
  ctx.save();

  // Anel externo (efeito radar/pulso — animado via dashOffset)
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur  = 28;
  ctx.strokeStyle = 'rgba(245,158,11,0.35)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -dashOffset * 0.5;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.stroke();

  // Disco de fundo
  ctx.setLineDash([]);
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#f59e0b';
  ctx.fillStyle   = 'rgba(30,37,64,0.95)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ícone de armazém (forma geométrica: telhado + corpo)
  ctx.shadowBlur = 0;
  ctx.fillStyle  = '#f59e0b';

  // Telhado (triângulo)
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 2);
  ctx.lineTo(x,     y - 10);
  ctx.lineTo(x + 8, y - 2);
  ctx.closePath();
  ctx.fill();

  // Corpo (retângulo)
  ctx.fillRect(x - 7, y - 2, 14, 10);

  // Porta (retângulo menor, cor escura)
  ctx.fillStyle = 'rgba(30,37,64,0.9)';
  ctx.fillRect(x - 3, y + 1, 6, 7);

  // Rótulo "D"
  ctx.fillStyle   = '#0d1424';
  ctx.font        = 'bold 7px Inter, sans-serif';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('D', x, y + 3);

  ctx.restore();
}

// ── Helper: roundRect compat. ────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Placeholder (tela inicial) ───────────────────────────────────
function drawPlaceholder(ctx, W, H) {
  ctx.fillStyle    = 'rgba(74,85,104,0.4)';
  ctx.font         = '14px Inter, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('▶  Pressione "Iniciar Evolução" para visualizar o mapa', W / 2, H / 2);
}

// ── Legenda das rotas (DOM) ──────────────────────────────────────
function buildLegend(routes) {
  const leg = document.getElementById('routeLegend');
  if (!leg) return;
  leg.innerHTML = routes
    .map((_, i) =>
      `<span class="legend-item">
        <span class="legend-dot" style="background:${ROUTE_COLORS[i % ROUTE_COLORS.length]};box-shadow:0 0 6px ${ROUTE_COLORS[i % ROUTE_COLORS.length]}55"></span>
        Rota ${i + 1}
      </span>`
    ).join('');
}

// ════════════════════════════════════════════════════════════════
//  drawChart — Gráfico de convergência da aptidão
//  PONTO DE ATENÇÃO (banca): a linha verde descendo indica que
//  o AG está encontrando soluções cada vez melhores.
// ════════════════════════════════════════════════════════════════
export function drawChart(canvas, histBest, histAvg, currentFrame = -1) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!histBest.length) return;

  const pad = { t: 22, r: 18, b: 38, l: 62 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const all  = [...histBest, ...histAvg];
  const minV = Math.min(...all) * 0.95;
  const maxV = Math.max(...all) * 1.05;
  const n    = histBest.length;

  const gx = i => pad.l + (i / Math.max(n - 1, 1)) * cW;
  const gy = v => pad.t + cH - ((v - minV) / (maxV - minV)) * cH;

  // Grade horizontal
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y   = pad.t + (g / 4) * cH;
    const val = maxV - (g / 4) * (maxV - minV);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle    = '#475569';
    ctx.font         = '9px JetBrains Mono, monospace';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(val.toFixed(2), pad.l - 6, y);
  }

  // Linha média (roxo)
  ctx.beginPath();
  histAvg.forEach((v, i) => i === 0 ? ctx.moveTo(gx(i), gy(v)) : ctx.lineTo(gx(i), gy(v)));
  ctx.strokeStyle = 'rgba(139,92,246,0.55)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();

  // Área preenchida melhor (verde)
  ctx.beginPath();
  histBest.forEach((v, i) => i === 0 ? ctx.moveTo(gx(i), gy(v)) : ctx.lineTo(gx(i), gy(v)));
  ctx.lineTo(gx(n - 1), pad.t + cH);
  ctx.lineTo(gx(0), pad.t + cH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  grad.addColorStop(0, 'rgba(16,185,129,0.22)');
  grad.addColorStop(1, 'rgba(16,185,129,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Linha melhor (verde com glow)
  ctx.save();
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  histBest.forEach((v, i) => i === 0 ? ctx.moveTo(gx(i), gy(v)) : ctx.lineTo(gx(i), gy(v)));
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.restore();

  // Marcador de frame atual (linha vertical) — PONTO DE ATENÇÃO (banca)
  if (currentFrame >= 0 && currentFrame < n) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245,158,11,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(gx(currentFrame), pad.t);
    ctx.lineTo(gx(currentFrame), pad.t + cH);
    ctx.stroke();
    // Ponto no marcador
    ctx.setLineDash([]);
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.arc(gx(currentFrame), gy(histBest[currentFrame]), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Labels X
  ctx.fillStyle    = '#475569';
  ctx.font         = '9px Inter, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  const step = Math.ceil(n / 8);
  histBest.forEach((_, i) => {
    if (i % step === 0 || i === n - 1) ctx.fillText(i + 1, gx(i), pad.t + cH + 6);
  });

  // Legenda
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#10b981';
  ctx.fillText('● Melhor', pad.l, pad.t - 7);
  ctx.fillStyle = 'rgba(139,92,246,0.9)';
  ctx.fillText('● Média', pad.l + 62, pad.t - 7);
}

// ════════════════════════════════════════════════════════════════
//  renderRouteDetails — detalhe das rotas no painel lateral
//  PONTO DE ATENÇÃO (banca): exibe carga de cada veículo e
//  barra de capacidade utilizada por rota.
// ════════════════════════════════════════════════════════════════
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
    const labels = route.map(idx => { load += clients[idx].demand; return clients[idx].label; });
    route.forEach(idx => { d += dist(prev, clients[idx]); prev = clients[idx]; });
    d += dist(prev, depot);
    const pct = Math.min(100, (load / cap) * 100);
    const overload = pct > 90;
    return `<div class="route-item" style="animation-delay:${i * 0.06}s">
      <div class="route-color-bar" style="background:${color};box-shadow:0 0 8px ${color}55"></div>
      <div class="route-info">
        <div class="route-title" style="color:${color}">Rota ${i + 1} — Veículo ${i + 1}</div>
        <div class="route-path">Depósito → ${labels.join(' → ')} → Depósito</div>
      </div>
      <div class="route-meta">
        <div class="route-dist">${(d * 100).toFixed(1)} km</div>
        <div class="route-load">Carga: ${load}/${cap}</div>
        <div class="route-load-bar">
          <div class="route-load-fill" style="width:${pct}%;background:${overload ? '#f43f5e' : color}"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}
