import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ArchiveResult {
  context: string;
  files: string[];
}

const SYNONYMS: Record<string, string[]> = {
  ia: ['ia', 'inteligencia artificial', 'anthropic', 'openai', 'modelo', 'algoritmo', 'chatgpt', 'gemini'],
  economia: ['economia', 'pib', 'inflacion', 'peso', 'banxico', 'deuda', 'arancel', 'mercado', 'empleo', 'salario'],
  israel: ['israel', 'gaza', 'hamas', 'netanyahu', 'medio oriente'],
  rusia: ['rusia', 'ucrania', 'putin', 'kremlin'],
  china: ['china', 'xi jinping', 'taiwan', 'pekin'],
  eeuu: ['eeuu', 'estados unidos', 'trump', 'washington', 'casa blanca'],
  mexico: ['mexico', 'sheinbaum', 'morena', 'banxico', 'cfe', 'pemex'],
  tecnologia: ['tecnologia', 'chip', 'semiconductor', 'nvidia', 'software', 'internet'],
  energia: ['energia', 'petroleo', 'gas', 'electricidad', 'cfe', 'solar']
};

function normalize(text: string): string {
  return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listMarkdown(dir: string, depth = 2): Promise<string[]> {
  if (depth < 0) return [];
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'Archivos') continue;
      files.push(...(await listMarkdown(full, depth - 1)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function buildTerms(queries: string[]): Set<string> {
  const terms = new Set<string>();
  for (const query of queries) {
    const norm = normalize(query);
    for (const word of norm.split(/[^a-z0-9]+/)) {
      if (word.length >= 3) terms.add(word);
    }
    for (const [key, values] of Object.entries(SYNONYMS)) {
      if (norm.includes(key)) {
        for (const value of values) terms.add(value);
      }
    }
  }
  return terms;
}

export async function loadArchiveContext(queries: string[], maxChars = 1200): Promise<ArchiveResult> {
  if ((process.env.ARCHIVE_ENABLED || '1') === '0') return { context: '', files: [] };

  const dir = process.env.ARCHIVE_DIR || path.join(os.homedir(), 'Documentos', 'Agente');
  const terms = buildTerms(queries);
  if (terms.size === 0) return { context: '', files: [] };

  const files = [...new Set(await listMarkdown(dir))];
  const scored: { file: string; text: string; score: number }[] = [];

  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      if (stat.size > 2_000_000) continue;
      const text = await fs.readFile(file, 'utf8');
      const norm = normalize(text);
      const base = normalize(path.basename(file, '.md'));
      let score = 0;
      for (const term of terms) {
        if (base.includes(term)) score += 25;
        const matches = norm.match(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g'));
        if (matches) score += Math.min(matches.length, 20);
      }
      if (score > 0) scored.push({ file, text, score });
    } catch {}
  }

  scored.sort((a, b) => b.score - a.score);
  const seenNames = new Set<string>();
  const chosen: { file: string; text: string; score: number }[] = [];
  for (const item of scored) {
    const baseName = path.basename(item.file);
    if (seenNames.has(baseName)) continue;
    seenNames.add(baseName);
    chosen.push(item);
    if (chosen.length >= 2) break;
  }
  const blocks: string[] = [];
  let total = 0;

  for (const item of chosen) {
    const paragraphs = item.text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const relevant = paragraphs.filter(p => {
      const norm = normalize(p);
      return [...terms].some(term => norm.includes(term));
    });
    const picked = (relevant.length > 0 ? relevant : paragraphs).slice(0, 8).join('\n\n');
    const budget = Math.max(700, Math.floor(maxChars / Math.max(chosen.length, 1)));
    const excerpt = picked.slice(0, budget).trim();
    if (!excerpt) continue;
    blocks.push(`### Archivo: ${path.basename(item.file)}\n${excerpt}`);
    total += excerpt.length;
    if (total >= maxChars) break;
  }

  return {
    context: blocks.join('\n\n').slice(0, maxChars),
    files: chosen.map(item => path.basename(item.file))
  };
}
