// =============================================================
//  Testes unitários das funções puras do GA (ga-engine.js)
//
//  Cobre cada etapa do algoritmo de forma isolada:
//  dist → shuffle → decode → evaluate → pmx → mutate
//  → tournamentSelect → initPop → generateProblem
// =============================================================
import { describe, it, expect } from 'vitest';
import {
  dist,
  shuffle,
  decode,
  evaluate,
  pmx,
  mutate,
  tournamentSelect,
  initPop,
  generateProblem,
} from '../server/ga-engine.js';

// ─── Fixtures reutilizáveis ───────────────────────────────────

const depot = { x: 0.5, y: 0.5 };

// 3 clientes com demandas simples para controle preciso
const clients = [
  { x: 0.8, y: 0.5, demand: 10 }, // idx 0
  { x: 0.5, y: 0.8, demand: 10 }, // idx 1
  { x: 0.2, y: 0.5, demand: 10 }, // idx 2
];

// Permutação identidade [0, 1, 2]
const chromId = [0, 1, 2];

// ─── Etapa 1: Distância euclidiana ───────────────────────────

describe('Etapa 1 — dist: distância euclidiana', () => {
  it('triângulo 3-4-5 → resultado exato 5', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('é comutativa e retorna zero entre pontos iguais', () => {
    const a = { x: 0.1, y: 0.9 };
    const b = { x: 0.7, y: 0.3 };
    expect(dist(a, b)).toBeCloseTo(dist(b, a));
    expect(dist(a, a)).toBe(0);
  });
});

// ─── Etapa 2: Embaralhamento (shuffle) ───────────────────────

describe('Etapa 2 — shuffle: permutação aleatória', () => {
  it('preserva todos os elementos do array original', () => {
    const original = [0, 1, 2, 3, 4];
    const result = shuffle(original);
    expect(result.sort()).toEqual([...original].sort());
  });

  it('não modifica o array original (imutabilidade)', () => {
    const original = [0, 1, 2, 3];
    const copia = [...original];
    shuffle(original);
    expect(original).toEqual(copia);
  });
});

// ─── Etapa 3: Decodificação do cromossomo ────────────────────

describe('Etapa 3 — decode: cromossomo → rotas', () => {
  it('todos os clientes aparecem nas rotas decodificadas', () => {
    const routes = decode(chromId, clients, 30);
    const todosIdx = routes.flat();
    expect(todosIdx.sort()).toEqual([0, 1, 2]);
  });

  it('nenhuma rota ultrapassa a capacidade do veículo', () => {
    // cap=15: cada rota pode ter no máximo 1 cliente (demanda 10 cabe, dois não)
    const routes = decode(chromId, clients, 15);
    for (const rota of routes) {
      const carga = rota.reduce((s, i) => s + clients[i].demand, 0);
      expect(carga).toBeLessThanOrEqual(15);
    }
  });
});

// ─── Etapa 4: Avaliação de fitness ───────────────────────────

describe('Etapa 4 — evaluate: cálculo de fitness', () => {
  it('retorna fit = 1 / dist (inversamente proporcional)', () => {
    const result = evaluate(chromId, clients, depot, 30);
    expect(result.fit).toBeCloseTo(1 / result.dist);
  });

  it('distância inclui retorno ao depósito em cada rota', () => {
    // Com cap suficiente, 1 rota: depot→c0→c1→c2→depot
    const { dist: d } = evaluate(chromId, clients, depot, 100);
    const manual =
      dist(depot, clients[0]) +
      dist(clients[0], clients[1]) +
      dist(clients[1], clients[2]) +
      dist(clients[2], depot);
    expect(d).toBeCloseTo(manual);
  });
});

// ─── Etapa 5: Cruzamento PMX ─────────────────────────────────

describe('Etapa 5 — pmx: cruzamento parcialmente mapeado', () => {
  it('filho é permutação válida: sem duplicatas e com todos os genes', () => {
    const p1 = [0, 1, 2, 3, 4];
    const p2 = [4, 3, 2, 1, 0];
    const filho = pmx(p1, p2);
    expect(filho.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('filho tem o mesmo tamanho dos pais', () => {
    const p1 = [0, 1, 2, 3];
    const p2 = [3, 2, 1, 0];
    expect(pmx(p1, p2)).toHaveLength(4);
  });
});

// ─── Etapa 6: Mutação por swap ───────────────────────────────

describe('Etapa 6 — mutate: mutação por troca de genes', () => {
  it('com taxa 0, cromossomo nunca é alterado', () => {
    for (let i = 0; i < 20; i++) {
      expect(mutate([0, 1, 2, 3], 0)).toEqual([0, 1, 2, 3]);
    }
  });

  it('resultado é sempre uma permutação válida dos genes originais', () => {
    const original = [0, 1, 2, 3, 4];
    const result = mutate(original, 1);
    expect(result.sort()).toEqual([...original].sort());
  });
});

// ─── Etapa 7: Seleção por torneio ────────────────────────────

describe('Etapa 7 — tournamentSelect: seleção por torneio', () => {
  it('retorna sempre um indivíduo que pertence à população', () => {
    const pop = [[0, 1], [1, 0], [0, 1]];
    const fits = [{ fit: 0.5 }, { fit: 0.9 }, { fit: 0.3 }];
    const selecionado = tournamentSelect(pop, fits);
    expect(pop).toContainEqual(selecionado);
  });

  it('com população de 1 elemento, retorna sempre esse elemento', () => {
    const pop = [[2, 1, 0]];
    const fits = [{ fit: 0.8 }];
    expect(tournamentSelect(pop, fits, 3)).toEqual([2, 1, 0]);
  });
});

// ─── Etapa 8: Inicialização da população ─────────────────────

describe('Etapa 8 — initPop: geração da população inicial', () => {
  it('gera exatamente popSize indivíduos', () => {
    expect(initPop(10, 5)).toHaveLength(10);
  });

  it('cada indivíduo é permutação válida de [0..n-1]', () => {
    const pop = initPop(5, 4);
    for (const ind of pop) {
      expect(ind.sort()).toEqual([0, 1, 2, 3]);
    }
  });
});

// ─── Etapa 9: Geração do problema ────────────────────────────

describe('Etapa 9 — generateProblem: instância aleatória do PRVC', () => {
  it('depósito está fixo em (0.5, 0.5)', () => {
    const { depot } = generateProblem(5);
    expect(depot).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it('gera numClients clientes com demanda entre 5 e 19', () => {
    const { clients } = generateProblem(8);
    expect(clients).toHaveLength(8);
    for (const c of clients) {
      expect(c.demand).toBeGreaterThanOrEqual(5);
      expect(c.demand).toBeLessThanOrEqual(19);
    }
  });
});
