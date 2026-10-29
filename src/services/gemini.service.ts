import { Injectable } from '@angular/core';

export interface XTrend {
  topic: string;
  hashtag: string;
  category: string;
  postsCount: string;
  summary: string;
}

export const DEFAULT_X_TRENDS: XTrend[] = [
  { topic: 'México', hashtag: '#Mexico', category: 'Nacional', postsCount: '65.2K posts', summary: 'Conversación nacional sobre coyuntura política y económica' },
  { topic: 'Claudia Sheinbaum', hashtag: '#Sheinbaum', category: 'Política', postsCount: '58.4K posts', summary: 'Conferencia matutina y proyectos prioritarios del gobierno' },
  { topic: 'Reforma Judicial', hashtag: '#ReformaJudicial', category: 'Política · Leyes', postsCount: '36.1K posts', summary: 'Proceso de elección popular en el Poder Judicial' },
  { topic: 'Economía y Finanzas', hashtag: '#Economia', category: 'Finanzas', postsCount: '29.3K posts', summary: 'Inflación, tasa de interés de Banxico y poder adquisitivo' },
  { topic: 'Aranceles y Comercio', hashtag: '#Aranceles', category: 'Comercio Exterior', postsCount: '25.8K posts', summary: 'Comercio internacional, acuerdos del T-MEC y política aduanera' },
  { topic: 'Inteligencia Artificial', hashtag: '#InteligenciaArtificial', category: 'Tecnología', postsCount: '44.9K posts', summary: 'Nuevos modelos generativos, chips y regulación digital' },
  { topic: 'Estados Unidos', hashtag: '#EEUU', category: 'Internacional', postsCount: '38.2K posts', summary: 'Decisiones de la Casa Blanca y relaciones bilaterales con México' },
  { topic: 'China', hashtag: '#China', category: 'Geopolítica', postsCount: '31.5K posts', summary: 'Manufactura, autos eléctricos, tecnología y comercio global' },
  { topic: 'Tipo de Cambio Dólar', hashtag: '#Dolar', category: 'Mercados', postsCount: '21.0K posts', summary: 'Fluctuación del peso mexicano en mercados de divisas' },
  { topic: 'Entendiendo Cosas', hashtag: '#EntendiendoCosas', category: 'Canal Oficial', postsCount: 'Comunidad', summary: 'Comunidad de periodismo y divulgación ciudadana de bolsillo' }
];

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  constructor() {}

  private getBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location) {
      return '';
    }
    const port = (typeof process !== 'undefined' && (process as any).env?.PORT) || 3000;
    return `http://localhost:${port}`;
  }

  private isValidApiKey(key: unknown): key is string {
    if (typeof key !== 'string') return false;
    const trimmed = key.trim();
    if (!trimmed) return false;
    if (
      trimmed === 'undefined' ||
      trimmed === 'null' ||
      trimmed === 'NaN' ||
      trimmed === '[object Object]' ||
      trimmed === 'YOUR_API_KEY'
    ) {
      return false;
    }
    return trimmed.length >= 15;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    let apiKey = '';
    if (typeof window !== 'undefined') {
      const winKey = (window as any).GEMINI_API_KEY;
      const procKey = (window as any).process?.env?.GEMINI_API_KEY;
      let localKey = '';
      try {
        localKey = localStorage.getItem('GEMINI_API_KEY') || '';
      } catch {}

      if (this.isValidApiKey(winKey)) {
        apiKey = winKey;
      } else if (this.isValidApiKey(procKey)) {
        apiKey = procKey;
      } else if (this.isValidApiKey(localKey)) {
        apiKey = localKey;
      }
    } else if (typeof process !== 'undefined' && (process as any).env) {
      const envKey = (process as any).env.GEMINI_API_KEY;
      if (this.isValidApiKey(envKey)) {
        apiKey = envKey;
      }
    }

    if (this.isValidApiKey(apiKey)) {
      headers['x-gemini-api-key'] = apiKey.trim();
    }

    return headers;
  }

  async generateNewsContent(topics: string[], customQuery?: string, activeXTrends: string[] = []): Promise<any[]> {
    const res = await fetch(`${this.getBaseUrl()}/api/gemini/generate-news`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        topics,
        customQuery,
        activeXTrends
      })
    });

    if (!res.ok) {
      let errorMsg = 'Error al generar noticias en el servidor.';
      try {
        const errorData = await res.json();
        if (errorData?.error) errorMsg = errorData.error;
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await res.json();
    return data.news || [];
  }

  async fetchXTrends(region: string = 'México'): Promise<XTrend[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/gemini/trends`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ region })
      });

      if (!res.ok) {
        return DEFAULT_X_TRENDS;
      }

      const data = await res.json();
      if (Array.isArray(data?.trends) && data.trends.length > 0) {
        return data.trends;
      }
      return DEFAULT_X_TRENDS;
    } catch (e) {
      console.warn('Error solicitando tendencias al servidor, usando fallback:', e);
      return DEFAULT_X_TRENDS;
    }
  }

  async generateAlternativeWhatsAppText(
    currentText: string,
    action: 'version_b' | 'shorter' | 'new_metaphor' | 'deep_dive_data',
    contextTopic?: string
  ): Promise<string> {
    const res = await fetch(`${this.getBaseUrl()}/api/gemini/adjust-whatsapp`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        currentText,
        action,
        contextTopic
      })
    });

    if (!res.ok) {
      let errorMsg = 'Error al ajustar texto de WhatsApp en el servidor.';
      try {
        const errorData = await res.json();
        if (errorData?.error) errorMsg = errorData.error;
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await res.json();
    return data.text || '';
  }

  async generateAlternativeTwitterText(
    currentText: string,
    action: 'hook_viral' | 'thread' | 'debate' | 'key_takeaways',
    contextTopic?: string
  ): Promise<string> {
    const res = await fetch(`${this.getBaseUrl()}/api/gemini/adjust-twitter`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        currentText,
        action,
        contextTopic
      })
    });

    if (!res.ok) {
      let errorMsg = 'Error al ajustar post de X en el servidor.';
      try {
        const errorData = await res.json();
        if (errorData?.error) errorMsg = errorData.error;
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await res.json();
    return data.text || '';
  }
}
