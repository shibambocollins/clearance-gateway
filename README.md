# Clearance Gateway

**Data only goes where it's cleared to go.**

A policy-enforcement gateway between employees (or apps) and AI providers, built for the Credify System Thinking Challenge 2026 (area 01, AI & Cybersecurity). The full README (judge path, results, limitations, AI-use disclosure) is written at feature freeze.

## Run locally

```bash
npm install
cp .env.example .env   # fill in values; leave Supabase empty to run without a database
npm run dev            # API on http://localhost:3001, web on http://localhost:5173
npm test
```

Specification: [docs/SPEC.md](docs/SPEC.md) · Decisions: [docs/decisions.md](docs/decisions.md)
