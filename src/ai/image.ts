export interface ImageResult {
  imageUrl: string;
  provider: string;
  model: string;
}

function env(key: string, fallback = ''): string {
  return (process.env[key] || '').trim() || fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
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

async function toDataUrl(buffer: Buffer, contentType: string): Promise<string> {
  return `data:${contentType.split(';')[0] || 'image/png'};base64,${buffer.toString('base64')}`;
}

let imageBusy: Promise<void> = Promise.resolve();
let imageLastCall = 0;

function imageMinInterval(): number {
  const configured = Number(env('POLLINATIONS_IMAGE_MIN_INTERVAL_MS'));
  return Number.isFinite(configured) && configured > 0 ? configured : 31_000;
}

async function withImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  const previous = imageBusy;
  let release!: () => void;
  imageBusy = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  const wait = imageMinInterval() - (Date.now() - imageLastCall);
  if (wait > 0) await sleep(wait);
  try {
    return await fn();
  } finally {
    imageLastCall = Date.now();
    release();
  }
}

function pollinationsModels(): string[] {
  const configured =
    env('POLLINATIONS_IMAGE_MODELS') || env('POLLINATIONS_IMAGE_MODEL') || 'flux,sana,turbo';
  const models = configured.split(',').map(m => m.trim()).filter(Boolean);
  for (const fallback of ['flux', 'sana', 'turbo']) {
    if (!models.includes(fallback)) models.push(fallback);
  }
  return [...new Set(models)];
}

async function pollinationsImage(prompt: string): Promise<ImageResult> {
  const imageBase = env('POLLINATIONS_IMAGE_URL', 'https://image.pollinations.ai/prompt').replace(/\/+$/, '');
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const shortPrompt = prompt.slice(0, 1400);
  const errors: string[] = [];

  return withImageSlot(async () => {
    for (let pass = 0; pass < 2; pass++) {
      for (const model of pollinationsModels()) {
        const url =
          `${imageBase}/${encodeURIComponent(shortPrompt)}` +
          `?width=1200&height=900&model=${encodeURIComponent(model)}&nologo=true&seed=${seed}`;
        try {
          const response = await fetchWithTimeout(
            url,
            { headers: { 'User-Agent': 'entendiendocosas-bot/1.0' } },
            75_000
          );
          if (response.ok) {
            const type = response.headers.get('content-type') || '';
            if (type.startsWith('image/')) {
              const buffer = Buffer.from(await response.arrayBuffer());
              return { imageUrl: await toDataUrl(buffer, type), provider: 'pollinations', model };
            }
            errors.push(`${model}: contenido ${type || 'desconocido'}`);
          } else {
            errors.push(`${model}: ${response.status}`);
          }
        } catch (err: any) {
          errors.push(`${model}: ${err?.message || err}`);
        }
      }
      if (pass === 0) await sleep(12_000);
    }
    throw new Error(errors.join(' | ') || 'Pollinations no devolvió una imagen');
  });
}

function pickOpenRouterImage(message: any): string {
  const images = Array.isArray(message?.images) ? message.images : [];
  for (const image of images) {
    const url = image?.image_url?.url || image?.url || image?.data;
    if (typeof url === 'string' && url) return url;
  }
  const content = Array.isArray(message?.content) ? message.content : [];
  for (const part of content) {
    const url = part?.image_url?.url || part?.image_url;
    if (typeof url === 'string' && url) return url;
  }
  return '';
}

async function openrouterImage(prompt: string): Promise<ImageResult> {
  const key = env('OPENROUTER_API_KEY');
  const model = env('OPENROUTER_IMAGE_MODEL');
  if (!key || !model) throw new Error('OpenRouter de imagen no configurado');

  const response = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': env('OPENROUTER_SITE_URL', 'https://entendiendocosas.lat'),
        'X-Title': 'Entendiendo Cosas'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text']
      })
    },
    120_000
  );
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data: any = await response.json();
  const imageUrl = pickOpenRouterImage(data?.choices?.[0]?.message);
  if (!imageUrl) throw new Error('OpenRouter no devolvió imagen');
  return { imageUrl, provider: 'openrouter', model };
}

async function customImage(prompt: string): Promise<ImageResult> {
  const url = env('IMAGE_API_URL');
  const model = env('IMAGE_MODEL');
  if (!url || !model) throw new Error('Endpoint de imagen propio no configurado');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env('IMAGE_API_KEY')) headers.Authorization = `Bearer ${env('IMAGE_API_KEY')}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, prompt, n: 1, size: env('IMAGE_SIZE', '1200x900'), response_format: 'b64_json' })
    },
    120_000
  );
  if (!response.ok) throw new Error(`Imagen propia ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data: any = await response.json();
  const item = data?.data?.[0];
  if (item?.b64_json) {
    return { imageUrl: `data:image/png;base64,${item.b64_json}`, provider: 'custom', model };
  }
  if (typeof item?.url === 'string' && item.url) {
    return { imageUrl: item.url, provider: 'custom', model };
  }
  throw new Error('El endpoint de imagen no devolvió datos');
}

export function configuredImageProviders(): string[] {
  return env('IMAGE_PROVIDERS', 'pollinations')
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);
}

export async function generateEditorialImage(prompt: string): Promise<ImageResult> {
  const errors: string[] = [];
  for (const provider of configuredImageProviders()) {
    try {
      if (provider === 'pollinations') return await pollinationsImage(prompt);
      if (provider === 'openrouter') return await openrouterImage(prompt);
      if (provider === 'custom' || provider === 'openai-compatible') return await customImage(prompt);
    } catch (err: any) {
      errors.push(`${provider}: ${err?.message || err}`);
    }
  }
  throw new Error(`Ningún generador de imágenes disponible. ${errors.join(' | ')}`);
}
