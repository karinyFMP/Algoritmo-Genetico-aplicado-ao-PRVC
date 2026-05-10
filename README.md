# Algoritmo Genético aplicado ao PRVC 🧬

Este projeto é uma demonstração interativa de um **Algoritmo Genético (AG)** aplicado ao **Problema de Roteamento de Veículos Capacitados (PRVC)**. A implementação é baseada no artigo de **Jadson José Monteiro Oliveira** (Unibalsas).

O objetivo é encontrar o conjunto de rotas que minimiza a distância total percorrida por uma frota de veículos para atender a uma série de clientes, respeitando a capacidade máxima de carga de cada veículo.

## Tecnologias

A aplicação utiliza uma arquitetura moderna para garantir performance e visualização em tempo real:

- **Frontend:** [Vite](https://vitejs.dev/) + Vanilla JS (HTML5 Canvas para renderização).
- **Backend:** [Express](https://expressjs.com/) (Node.js).
- **Streaming:** [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) para transmissão em tempo real das gerações do algoritmo.
- **Estilo:** CSS Moderno com Glassmorphism e Dark Mode.

## Arquitetura

O algoritmo genético é executado no **servidor (Express)**. Isso permite que o processamento pesado seja feito fora da thread principal do navegador. Cada nova geração "vencedora" é enviada ao frontend via SSE, permitindo que o usuário acompanhe a convergência do algoritmo ao vivo.

### Parâmetros do AG:
- **Representação:** Cromossomo por permutação de clientes.
- **Cruzamento (Crossover):** PMX (Partially Mapped Crossover) para preservar a ordem e validade das rotas.
- **Seleção:** Torneio.
- **Elitismo:** Preservação dos melhores indivíduos de cada geração.
- **Mutação:** Swap aleatório entre genes.

## Como Executar

### Pré-requisitos:
- [Node.js](https://nodejs.org/) (v16 ou superior recomendado).

### Instalação:
1. Clone o repositório ou baixe os arquivos.
2. No diretório raiz, instale as dependências:
   ```bash
   npm install
   ```

### Desenvolvimento:
Para rodar tanto o servidor Express quanto o servidor de desenvolvimento do Vite simultaneamente:
```bash
npm run dev
```
Acesse o frontend em `http://localhost:5173`.

### Produção:
1. Gere o build do frontend:
   ```bash
   npm run build
   ```
2. Inicie o servidor:
   ```bash
   npm start
   ```

## 📄 Referência

Projeto baseado no trabalho:
**OLIVEIRA, Jadson José Monteiro.** *Algoritmo Genético Aplicado ao Problema de Roteamento de Veículos Capacitados (PRVC)*. Unibalsas.

---
Desenvolvido para fins didáticos e demonstração técnica.
