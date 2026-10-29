export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  validate?: (text: string) => boolean;
}

interface Provider {
  name: string;
  kind: 'ollama' | 'openai-compatible';
  baseUrl: string;
  model: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 120_000;

let envLoaded = false;

export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {}
  }
}

function env(key: string): string {
  loadEnv();
  return (process.env[key] || '').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let pollinationsBusy: Promise<void> = Promise.resolve();
let pollinationsLastCall = 0;

function pollinationsMinInterval(): number {
  const configured = Number(env('POLLINATIONS_MIN_INTERVAL_MS'));
  return Number.isFinite(configured) && configured > 0 ? configured : 31_000;
}

async function withPollinationsSlot<T>(fn: () => Promise<T>): Promise<T> {
  const previous = pollinationsBusy;
  let release!: () => void;
  pollinationsBusy = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  const wait = pollinationsMinInterval() - (Date.now() - pollinationsLastCall);
  if (wait > 0) await sleep(wait);
  try {
    return await fn();
  } finally {
    pollinationsLastCall = Date.now();
    release();
  }
}

let ollamaProbe: Promise<boolean> | undefined;

function ollamaBase(): string {
  return (env('OLLAMA_URL') || 'http://127.0.0.1:11434').replace(/\/+$/, '');
}

async function canUseOllama(): Promise<boolean> {
  if (!env('OLLAMA_MODEL')) return false;
  if (!ollamaProbe) {
    ollamaProbe = (async () => {
      try {
        const r = await fetchWithTimeout(`${ollamaBase()}/api/tags`, {}, 1500);
        return r.ok;
      } catch {
        return false;
      }
    })();
  }
  return ollamaProbe;
}

async function resolveProviders(): Promise<Provider[]> {
  const providers: Record<string, Provider | undefined> = {};

  if (await canUseOllama()) {
    providers.ollama = {
      name: 'ollama',
      kind: 'ollama',
      baseUrl: ollamaBase(),
      model: env('OLLAMA_MODEL')
    };
  }

  const groqKey = env('GROQ_API_KEY');
  if (groqKey) {
    providers.groq = {
      name: 'groq',
      kind: 'openai-compatible',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: env('GROQ_MODEL') || 'openai/gpt-oss-20b',
      apiKey: groqKey
    };
  }

  const openrouterKey = env('OPENROUTER_API_KEY');
  if (openrouterKey) {
    providers.openrouter = {
      name: 'openrouter',
      kind: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: env('OPENROUTER_MODEL') || 'google/gemma-4-26b-a4b-it:free',
      apiKey: openrouterKey,
      extraHeaders: {
        'HTTP-Referer': env('OPENROUTER_SITE_URL') || 'https://entendiendocosas.lat',
        'X-Title': 'Entendiendo Cosas'
      }
    };
  }

  const geminiKey = env('GEMINI_API_KEY');
  if (env('AI_ALLOW_GEMINI') === '1' && geminiKey) {
    providers.gemini = {
      name: 'gemini',
      kind: 'openai-compatible',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: env('GEMINI_MODEL') || 'gemini-2.0-flash',
      apiKey: geminiKey
    };
  }

  const customBase = env('OPENAI_BASE_URL');
  const customModel = env('OPENAI_MODEL');
  if (customBase && customModel) {
    providers.custom = {
      name: 'custom',
      kind: 'openai-compatible',
      baseUrl: customBase.replace(/\/+$/, ''),
      model: customModel,
      apiKey: env('OPENAI_API_KEY')
    };
  }

  providers.pollinations = {
    name: 'pollinations',
    kind: 'openai-compatible',
    baseUrl: (env('POLLINATIONS_TEXT_URL') || 'https://text.pollinations.ai/openai').replace(/\/+$/, ''),
    model: env('POLLINATIONS_MODEL') || 'openai',
    apiKey: env('POLLINATIONS_API_KEY') || undefined
  };

  const defaultOrder = ['ollama', 'groq', 'openrouter', 'custom', 'pollinations'];
  const forced = env('AI_PROVIDERS')
    ? env('AI_PROVIDERS').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : defaultOrder;

  return forced.map(name => providers[name]).filter((p): p is Provider => Boolean(p));
}

async function callProvider(p: Provider, messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const temperature = opts.temperature ?? 0.8;

  if (p.kind === 'ollama') {
    const body: Record<string, unknown> = {
      model: p.model,
      messages,
      stream: false,
      options: { temperature }
    };
    if (opts.json) body.format = 'json';
    const r = await fetchWithTimeout(
      `${p.baseUrl}/api/chat`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      timeoutMs
    );
    if (!r.ok) throw new HttpError(r.status, (await r.text()).slice(0, 500));
    const data: any = await r.json();
    return String(data?.message?.content || '');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;
  Object.assign(headers, p.extraHeaders || {});

  const body: Record<string, unknown> = { model: p.model, messages, temperature };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.json) body.response_format = { type: 'json_object' };

  if (p.name === 'pollinations') {
    body.reasoning_effort = opts.reasoningEffort || env('POLLINATIONS_REASONING_EFFORT') || 'low';
  }
  if (p.name === 'openrouter') {
    body.provider = { allow_fallbacks: false, data_collection: 'deny' };
  }

  const url = `${p.baseUrl}/chat/completions`;
  const doFetch = () =>
    fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, timeoutMs);

  const execute = async (): Promise<string> => {
    let r = await doFetch();
    if (!r.ok && opts.json && (r.status === 400 || r.status === 422)) {
      delete body.response_format;
      r = await doFetch();
    }
    if (!r.ok) throw new HttpError(r.status, (await r.text()).slice(0, 500));
    const data: any = await r.json();
    const msg = data?.choices?.[0]?.message || {};
    let content = String(msg.content || '');
    if (!content.trim() && typeof msg.reasoning === 'string' && msg.reasoning.trim()) {
      content = msg.reasoning;
    }
    if (!content.trim() && typeof msg.reasoning_content === 'string') {
      content = msg.reasoning_content;
    }
    return content;
  };

  return p.name === 'pollinations' ? withPollinationsSlot(execute) : execute();
}

export async function chatComplete(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<{ text: string; provider: string; model: string }> {
  const providers = await resolveProviders();
  if (providers.length === 0) {
    throw new Error('No hay proveedor de IA configurado.');
  }

  const errors: string[] = [];
  for (const p of providers) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const text = await callProvider(p, messages, opts);
        if (text.trim()) {
          if (opts.validate && !opts.validate(text)) {
            throw new Error('respuesta inválida (no cumple el formato esperado)');
          }
          return { text, provider: p.name, model: p.model };
        }
        throw new Error('respuesta vacía');
      } catch (err: any) {
        const status = typeof err?.status === 'number' ? err.status : 0;
        const isFreeLimit = status === 402 || status === 429;
        const invalidFormat = String(err?.message || '').includes('inválida');
        const retriable = !invalidFormat && (isFreeLimit || status >= 500 || !status);
        if (retriable && attempt < 2) {
          const waitMs = isFreeLimit
            ? pollinationsMinInterval() + 2_000
            : 1500 * (attempt + 1) + Math.round(Math.random() * 500);
          await sleep(waitMs);
          continue;
        }
        errors.push(`${p.name}: ${err?.message || err}`);
        break;
      }
    }
  }

  throw new Error(`Ningún proveedor de IA disponible. ${errors.join(' | ')}`);
}

export async function describeProviders(): Promise<{ order: string[]; ollama: boolean }> {
  const providers = await resolveProviders();
  return {
    order: providers.map(p => `${p.name}:${p.model}`),
    ollama: await canUseOllama()
  };
}
