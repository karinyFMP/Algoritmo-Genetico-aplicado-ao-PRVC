// =============================================================
//  Teste de integração — fluxo completo do GA (Etapa 10)
//
//  Verifica que o runGA executa todas as gerações, emite os
//  frames corretamente e que a melhor distância nunca piora
//  ao longo da evolução (propriedade de elitismo).
// =============================================================
import { describe, it, expect } from 'vitest';
import { generateProblem, runGA } from '../server/ga-engine.js';

const PARAMS = {
  popSize: 10,
  maxGen: 5,
  mutRate: 0.1,
  eliteRate: 0.2,
  vehicleCapacity: 50,
};

describe('Etapa 10 — runGA: execução completa do algoritmo genético', () => {
  it('onGeneration é chamado exatamente maxGen vezes e o último frame tem done=true', async () => {
    const problema = generateProblem(6);
    const frames = [];

    await runGA(PARAMS, problema, async (data) => {
      frames.push(data);
    });

    expect(frames).toHaveLength(PARAMS.maxGen);
    expect(frames.at(-1).done).toBe(true);
    expect(frames.every((f, i) => f.generation === i + 1)).toBe(true);
  });

  it('bestDist nunca aumenta entre gerações (elitismo garante monotonia)', async () => {
    const problema = generateProblem(6);
    const distancias = [];

    await runGA(PARAMS, problema, async (data) => {
      distancias.push(data.bestDist);
    });

    for (let i = 1; i < distancias.length; i++) {
      expect(distancias[i]).toBeLessThanOrEqual(distancias[i - 1] + 1e-9);
    }
  });

  it('todos os clientes aparecem nas rotas do frame final', async () => {
    const problema = generateProblem(6);
    let framesFinal = null;

    await runGA(PARAMS, problema, async (data) => {
      framesFinal = data;
    });

    const idxNasRotas = framesFinal.bestRoutes.flat().sort((a, b) => a - b);
    const idxEsperados = Array.from({ length: 6 }, (_, i) => i);
    expect(idxNasRotas).toEqual(idxEsperados);
  });
});
