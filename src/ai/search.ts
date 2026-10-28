export interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
  snippet: string;
}

export interface ResearchResult {
  context: string;
  sources: { title: string; link: string; source: string; published: string }[];
}

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function env(key: string, fallback: string): string {
  return (process.env[key] || '').trim() || fallback;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”');
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function tagContent(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

export interface SearchFilters {
  freshness?: 'day' | 'week' | 'month' | 'year';
  country?: string;
  language?: string;
  domains?: string[];
  limit?: number;
}

const FRESHNESS_GOOGLE: Record<string, string> = {
  day: 'when:1d',
  week: 'when:7d',
  month: 'when:30d',
  year: 'when:1y'
};

const FRESHNESS_BRAVE: Record<string, string> = {
  day: 'pd',
  week: 'pw',
  month: 'pm',
  year: 'py'
};

const FRESHNESS_TAVILY_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365
};

function normalizeFilters(filters: SearchFilters = {}): Required<Omit<SearchFilters, 'domains'>> & { domains: string[] } {
  const freshness = filters.freshness;
  return {
    freshness: freshness === 'day' || freshness === 'week' || freshness === 'month' || freshness === 'year'
      ? freshness
      : (env('NEWS_FRESHNESS', 'week') as 'day' | 'week' | 'month' | 'year'),
    country: filters.country || env('NEWS_COUNTRY', 'MX'),
    language: filters.language || env('NEWS_LANGUAGE', 'es'),
    domains: filters.domains && filters.domains.length > 0
      ? filters.domains
      : env('NEWS_DOMAINS', '').split(',').map(d => d.trim()).filter(Boolean),
    limit: Math.min(Math.max(filters.limit || Number(env('NEWS_MAX_RESULTS', '8')) || 8, 1), 20)
  };
}

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export async function searchGoogleNews(query: string, limit = 8, filters: SearchFilters = {}): Promise<NewsItem[]> {
  const f = normalizeFilters({ ...filters, limit });
  const locale = env('NEWS_LOCALE', 'es-419');
  const domainFilter = f.domains.map(d => `site:${d}`).join(' OR ');
  const freshness = FRESHNESS_GOOGLE[f.freshness] || '';
  const fullQuery = [query, domainFilter ? `(${domainFilter})` : '', freshness].filter(Boolean).join(' ');

  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(fullQuery)}` +
    `&hl=${encodeURIComponent(locale)}&gl=${encodeURIComponent(f.country)}&ceid=${f.country}:${locale}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: controller.signal
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(xml)) && items.length < f.limit) {
      const raw = match[1];
      const title = tagContent(raw, 'title');
      if (!title) continue;
      const source = tagContent(raw, 'source') || title.split(' - ').pop() || '';
      items.push({
        title: title.replace(/\s+-\s+[^-]+$/, '').trim(),
        link: tagContent(raw, 'link'),
        source,
        published: tagContent(raw, 'pubDate'),
        snippet: stripHtml(tagContent(raw, 'description'))
      });
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

let braveLastCall = 0;

async function braveThrottle(): Promise<void> {
  const wait = 1_100 - (Date.now() - braveLastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  braveLastCall = Date.now();
}

export async function searchBrave(query: string, limit = 8, filters: SearchFilters = {}): Promise<NewsItem[]> {
  const key = env('BRAVE_SEARCH_API_KEY', '');
  if (!key) return [];
  const f = normalizeFilters({ ...filters, limit });
  await braveThrottle();

  const domainFilter = f.domains.map(d => `site:${d}`).join(' OR ');
  const fullQuery = [query, domainFilter ? `(${domainFilter})` : ''].filter(Boolean).join(' ');
  const params = new URLSearchParams({
    q: fullQuery,
    count: String(f.limit),
    country: f.country,
    search_lang: f.language,
    ui_lang: `${f.language}-${f.country}`,
    freshness: FRESHNESS_BRAVE[f.freshness] || 'pw',
    extra_snippets: 'true',
    safesearch: 'moderate'
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/news/search?${params}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': key,
        'User-Agent': USER_AGENT
      },
      signal: controller.signal
    });
    if (!res.ok) {
      console.warn(`Brave Search respondió ${res.status}`);
      return [];
    }
    const data: any = await res.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    return results.slice(0, f.limit).map(item => {
      const link = String(item.url || '');
      return {
        title: stripHtml(String(item.title || '')),
        link,
        source: String(item.meta_url?.hostname || item.meta_url?.netloc || item.profile?.name || sourceFromUrl(link)),
        published: String(item.page_age || item.age || ''),
        snippet: stripHtml(
          [item.description, ...(Array.isArray(item.extra_snippets) ? item.extra_snippets : [])]
            .filter(Boolean)
            .join(' ')
        )
      };
    }).filter(item => item.title && item.link);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function searchTavily(query: string, limit = 8, filters: SearchFilters = {}): Promise<NewsItem[]> {
  const key = env('TAVILY_API_KEY', '');
  if (!key) return [];
  const f = normalizeFilters({ ...filters, limit });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        api_key: key,
        query,
        topic: 'news',
        search_depth: env('TAVILY_SEARCH_DEPTH', 'advanced'),
        max_results: f.limit,
        days: FRESHNESS_TAVILY_DAYS[f.freshness] || 7,
        include_domains: f.domains,
        include_answer: false,
        include_raw_content: false
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      console.warn(`Tavily respondió ${res.status}`);
      return [];
    }
    const data: any = await res.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    return results.slice(0, f.limit).map(item => {
      const link = String(item.url || '');
      return {
        title: stripHtml(String(item.title || '')),
        link,
        source: sourceFromUrl(link),
        published: String(item.published_date || ''),
        snippet: stripHtml(String(item.content || ''))
      };
    }).filter(item => item.title && item.link);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function configuredSearchProviders(): string[] {
  return (env('SEARCH_PROVIDERS', 'brave,tavily,google-news'))
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);
}

export async function searchNews(query: string, limit = 8, filters: SearchFilters = {}): Promise<NewsItem[]> {
  for (const provider of configuredSearchProviders()) {
    if (provider === 'brave') {
      const items = await searchBrave(query, limit, filters);
      if (items.length > 0) return items;
    } else if (provider === 'tavily') {
      const items = await searchTavily(query, limit, filters);
      if (items.length > 0) return items;
    } else if (provider === 'google-news' || provider === 'googlenews' || provider === 'google') {
      const items = await searchGoogleNews(query, limit, filters);
      if (items.length > 0) return items;
    }
  }
  return [];
}

export function searchProviderStatus(): { order: string[]; brave: boolean; tavily: boolean; googleNews: boolean } {
  return {
    order: configuredSearchProviders(),
    brave: Boolean(env('BRAVE_SEARCH_API_KEY', '')),
    tavily: Boolean(env('TAVILY_API_KEY', '')),
    googleNews: true
  };
}

export async function fetchArticleText(url: string, maxChars = 3000): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (!type.includes('html') && !type.includes('text')) return '';
    const html = await res.text();

    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => stripHtml(m[1]))
      .filter(p => p.length > 60);
    const body = paragraphs.length > 0 ? paragraphs.join('\n') : stripHtml(html);
    return body.slice(0, maxChars);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export async function searchDuckDuckGo(query: string, limit = 8): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ q: query }).toString(),
      signal: controller.signal
    });
    if (!res.ok) return [];
    const html = await res.text();
    const items: NewsItem[] = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) && items.length < limit) {
      let link = decodeEntities(match[1]);
      const redirect = link.match(/uddg=([^&]+)/);
      if (redirect) link = decodeURIComponent(redirect[1]);
      items.push({
        title: stripHtml(match[2]),
        link,
        source: (() => {
          try {
            return new URL(link).hostname.replace(/^www\./, '');
          } catch {
            return '';
          }
        })(),
        published: '',
        snippet: stripHtml(match[3])
      });
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function formatSourceDate(published: string): string {
  if (!published) return '';
  const date = new Date(published);
  if (Number.isNaN(date.getTime())) return published;
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function buildResearch(
  queries: string[],
  options: { url?: string; limit?: number; deep?: boolean; filters?: SearchFilters } = {}
): Promise<ResearchResult> {
  const limit = options.limit ?? 7;
  const deep = options.deep ?? true;
  const collected: NewsItem[] = [];
  const seen = new Set<string>();

  const addItems = (items: NewsItem[]) => {
    for (const item of items) {
      const key = item.title.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      collected.push(item);
    }
  };

  if (options.url) {
    const text = await fetchArticleText(options.url, 6000);
    if (text) {
      collected.push({
        title: 'Contenido del enlace proporcionado',
        link: options.url,
        source: (() => {
          try {
            return new URL(options.url!).hostname.replace(/^www\./, '');
          } catch {
            return options.url!;
          }
        })(),
        published: new Date().toISOString(),
        snippet: text
      });
    }
  }

  const uniqueQueries = [...new Set(queries.map(q => q.trim()).filter(Boolean))].slice(0, 4);
  for (const query of uniqueQueries) {
    addItems(await searchNews(query, limit, options.filters));
  }

  if (collected.length === 0) {
    addItems(await searchNews('noticias México hoy', limit, options.filters));
  }

  if (deep) {
    const targets = collected
      .filter(i => i.link && i.snippet.length < 700 && !i.snippet.startsWith('Contenido del enlace'))
      .slice(0, 5);
    const texts = await Promise.all(targets.map(i => fetchArticleText(i.link, 2500)));
    texts.forEach((text, idx) => {
      if (text) targets[idx].snippet = text;
    });
  }

  const selected = collected.slice(0, 12);
  const blocks = selected.map((item, idx) => {
    const date = formatSourceDate(item.published);
    const body = stripHtml(item.snippet).slice(0, 2200);
    return [
      `[${idx + 1}] ${item.title}`,
      `Fuente: ${item.source}${date ? ` · ${date}` : ''}`,
      `URL: ${item.link}`,
      body ? `Extracto: ${body}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  });

  return {
    context: blocks.join('\n\n').slice(0, 16_000),
    sources: selected.map(item => ({
      title: item.title,
      link: item.link,
      source: item.source,
      published: item.published
    }))
  };
}
