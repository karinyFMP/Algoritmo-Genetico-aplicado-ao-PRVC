// =============================================================
//  Express Server — AG no PRVC
// =============================================================
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { generateProblem, runGA } from './ga-engine.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Serve built Vite frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// ── In-memory job store ──────────────────────────────────────
// jobId → { params, problem, clients (SSE) }
const jobs = new Map();
// SSE client queues: jobId → array of pending SSE writers
const sseClients = new Map();

// ── POST /api/ga/start ───────────────────────────────────────
// Body: { numClients, numVehicles, vehicleCapacity, popSize,
//         maxGen, mutRate, eliteRate }
// Returns: { jobId, clients, depot }
app.post('/api/ga/start', (req, res) => {
  const {
    numClients = 12,
    vehicleCapacity = 50,
    popSize = 80,
    maxGen = 150,
    mutRate = 0.05,
    eliteRate = 0.15,
  } = req.body;

  const jobId = randomUUID();
  const problem = generateProblem(numClients);

  jobs.set(jobId, { params: { vehicleCapacity, popSize, maxGen, mutRate, eliteRate }, problem });
  sseClients.set(jobId, []);

  // Start GA asynchronously
  runGA(
    { vehicleCapacity, popSize, maxGen, mutRate, eliteRate },
    problem,
    async (data) => {
      const writers = sseClients.get(jobId) || [];
      const payload = `data: ${JSON.stringify(data)}\n\n`;
      writers.forEach(w => w.write(payload));
      if (data.done) {
        writers.forEach(w => w.end());
        sseClients.delete(jobId);
        jobs.delete(jobId);
      }
    }
  ).catch(err => {
    console.error(`GA job ${jobId} error:`, err);
    const writers = sseClients.get(jobId) || [];
    writers.forEach(w => w.end());
    sseClients.delete(jobId);
    jobs.delete(jobId);
  });

  res.json({ jobId, clients: problem.clients, depot: problem.depot });
});

// ── GET /api/ga/stream/:jobId ────────────────────────────────
// SSE stream of generation events
app.get('/api/ga/stream/:jobId', (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send heartbeat comment to establish connection
  res.write(': connected\n\n');

  if (!sseClients.has(jobId)) {
    res.write(`data: ${JSON.stringify({ error: 'Job not found or already done' })}\n\n`);
    res.end();
    return;
  }

  sseClients.get(jobId).push(res);

  req.on('close', () => {
    const writers = sseClients.get(jobId);
    if (writers) {
      const idx = writers.indexOf(res);
      if (idx !== -1) writers.splice(idx, 1);
    }
  });
});

// ── Fallback SPA route ───────────────────────────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.status(404).send('Not found — run `npm run build` first or use `npm run dev`');
  });
});

app.listen(PORT, () => {
  console.log(`\n  🚀 Express API ready on http://localhost:${PORT}`);
  console.log(`  📡 SSE stream at   http://localhost:${PORT}/api/ga/stream/:jobId\n`);
});
