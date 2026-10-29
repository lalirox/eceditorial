import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse
} from '@angular/ssr/node';
import express, { Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chatComplete, describeProviders } from './ai/llm';
import { buildResearch, searchProviderStatus } from './ai/search';

const app = express();
app.use(express.json({ limit: '10mb' }));

function delay(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

function extractJsonArray(text: string, keys: string[]): any[] | null {
  if (!text) return null;
  let clean = text.trim();
  const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) clean = fence[1].trim();

  const tryParse = (raw: string): any => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };

  let data = tryParse(clean);
  if (data === undefined) {
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start !== -1 && end > start) data = tryParse(clean.substring(start, end + 1));
  }
  if (data === undefined) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end > start) data = tryParse(clean.substring(start, end + 1));
  }

  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of keys) {
      if (Array.isArray((data as any)[key])) return (data as any)[key];
    }
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) return value as any[];
    }
    return [data];
  }
  return null;
}


const ES_STOPWORDS = new Set([
  'el','la','los','las','de','del','que','y','en','un','una','para','con','por','es','se','al','lo','como','mas','pero','sus','le','ya','o','este','si','porque','esta','entre','cuando','muy','sin','sobre','tambien','me','hasta','hay','donde','quien','desde','todo','nos','durante','todos','uno','les','ni','contra','otros','ese','eso','ante','ellos','esto','antes','algunos','unos','yo','otro','otras','otra','tanto','esa','estos','mucho','quienes','nada','muchos','cual','poco','ella','estar','estas','algunas','algo','nosotros','fue','son','ser','tiene','tienen','hace','hacen','puede','pueden','cada','otra','mismo','misma','nuestro','nuestra','mi','tu','su','nos','le','les'
]);
const EN_STOPWORDS = new Set([
  'the','and','is','to','of','in','that','for','with','on','as','at','by','from','it','this','be','are','was','were','or','an','not','have','has','had','but','they','you','we','he','she','his','her','their','our','your','my','me','mine','us','them','these','those','will','would','can','could','should','about','into','than','then','there','here','what','which','who','when','where','why','how','all','any','more','most','some','such','only','also','just','very','been','being','because','while','after','before','over','under','again'
]);

function isMostlySpanish(text: string): boolean {
  const clean = (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = clean.match(/[a-z]+/g) || [];
  if (words.length < 12) return true;
  let es = 0;
  let en = 0;
  for (const word of words) {
    if (ES_STOPWORDS.has(word)) es++;
    else if (EN_STOPWORDS.has(word)) en++;
  }
  if (en <= 2) return true;
  return es >= en * 1.5;
}

async function ensureSpanish(text: string, label: string): Promise<string> {
  if (!text || !text.trim() || isMostlySpanish(text)) return text;
  console.warn(`[idioma] ${label} salió en inglés; traduciendo al español`);
  try {
    const { text: translated } = await chatComplete(
      [
        { role: 'system', content: 'Eres traductor editorial. Traduce al español neutro de México conservando formato, emojis, saltos de línea y hashtags. Devuelve solo el texto traducido, sin explicaciones.' },
        { role: 'user', content: text }
      ],
      { temperature: 0.2, maxTokens: 4_000, timeoutMs: 120_000 }
    );
    return translated.trim() || text;
  } catch (err: any) {
    console.warn(`[idioma] no se pudo traducir ${label}:`, err?.message || err);
    return text;
  }
}

function cleanWhatsAppText(text: string): string {
  if (!text) return '';
  let cleaned = text;
  // Eliminar encabezados markdown (# Título, ## Título)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
  // Eliminar negritas y cursivas de markdown (**palabra**, *palabra*, _palabra_)
  cleaned = cleaned.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*\n]+)\*/g, '$1');
  cleaned = cleaned.replace(/\*/g, '');
  cleaned = cleaned.replace(/_([^_\n]+)_/g, '$1');
  // Eliminar viñetas con guiones (- texto) o puntos (• texto)
  cleaned = cleaned.replace(/^[ \t]*[-•][ \t]+/gm, '');
  // Normalizar saltos de línea excesivos
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

// Default fallback trends
const DEFAULT_X_TRENDS = [
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

// 1. API: GENERAR NOTICIAS (WHATSAPP + X + PROMPTS)
app.post('/api/gemini/generate-news', async (req: Request, res: Response): Promise<void> => {
  try {
    const { topics = [], customQuery = '', activeXTrends = [], filters = {} } = req.body;

    const expandedTopics = (topics as string[]).map(t => {
      if (t === 'China Tech') {
        return 'Empresas Tecnológicas Chinas: Tencent, Alibaba Group, ByteDance, Huawei, Xiaomi, Baidu, JD.com, Meituan, PDD Holdings (Pinduoduo), BYD, Lenovo, NetEase, DJI, CATL, NIO, ZTE, SMIC, Hikvision, Kuaishou, XPeng';
      }
      if (t === 'Estados Unidos Tech') {
        return 'Empresas Tecnológicas de EE.UU.: Apple, Microsoft, NVIDIA, Alphabet (Google), Amazon, Meta (Facebook), Tesla, Broadcom, Oracle, AMD, Adobe, Salesforce, Cisco, Intel, Qualcomm, IBM, Netflix, PayPal, Intuit, Uber, Airbnb, Micron Technology, Palantir';
      }
      if (t === 'Europa Tech') {
        return 'Empresas Tecnológicas de Europa: ASML, SAP, Spotify, Accenture, Capgemini, Adyen, Dassault Systèmes, Infineon Technologies, STMicroelectronics, Amadeus, Nokia, Ericsson, Logitech, Hexagon, Siemens, Sage Group, Just Eat Takeaway, Wise, Revolut, Klarna, Booking.com (Booking Holdings)';
      }
      if (t === 'Latinoamérica Tech') {
        return 'Empresas Tecnológicas de Latinoamérica: Mercado Libre, Nubank, Globant, TOTVS, Rappi, dLocal, PagSeguro, StoneCo, Vtex, Softtek, KAVAK, Stefanini, Despegar, Inter, Ualá, Creditas, Clip, Bitso, Neoris';
      }
      if (t === 'Corea del Sur Tech') {
        return 'Empresas Tecnológicas de Corea del Sur: Samsung Electronics, SK Hynix, LG Electronics, Naver, Kakao, Coupang, NCSoft, Krafton, Samsung SDI, LG Display, Netmarble, Pearl Abyss, KT Corporation, SK Telecom';
      }
      if (t === 'Japón Tech') {
        return 'Empresas Tecnológicas de Japón: Sony Group, Nintendo, SoftBank Group, Keyence, Tokyo Electron, Canon, Panasonic, Fujitsu, Rakuten Group, Renesas Electronics, NEC, Hitachi, Murata Manufacturing, Capcom, Square Enix, TDK, Kyocera, Nikon';
      }
      if (t === 'Rusia Tech') {
        return 'Empresas Tecnológicas de Rusia: Yandex, VK (VKontakte), Kaspersky Lab, Ozon, Wildberries, Rostelecom, MTS, Positive Technologies, 1C Company, Avito, Softline, Astra Linux';
      }
      if (t === 'Taiwán Tech') {
        return 'Empresas Tecnológicas de Taiwán: TSMC, Foxconn (Hon Hai Precision), MediaTek, ASUS, Acer, Delta Electronics, UMC, ASE Technology, Realtek, Quanta Computer, Pegatron, Wistron, Novatek, Nanya Technology, HTC, MSI, Gigabyte';
      }
      if (t === 'Singapur Tech') {
        return 'Empresas Tecnológicas de Singapur: Sea Limited (Shopee/Garena), Grab, Razer, Flex, Singtel, Carousell, PropertyGuru, Trax, Nanofilm Technologies, Venture Corporation, Dyson (Sede Global), Coda Payments, Acronis';
      }
      if (t === 'África Tech') {
        return 'Empresas Tecnológicas de África: Naspers, Prosus, MTN Group, Vodacom, Safaricom, Jumia, Fawry, Flutterwave, Interswitch, OPay, Chipper Cash, Andela, Liquid Intelligent Technologies, Takealot';
      }
      return t;
    });

    const topicsString = expandedTopics.length > 0 ? expandedTopics.join(', ') : 'Temas Generales';
    const isUrl = customQuery ? /^(http|https):\/\/[^ "]+$/.test(customQuery.trim()) : false;

    let focusInstruction = '';
    let searchContext = '';

    if (isUrl) {
      focusInstruction = `
        🔴 MODO ANÁLISIS DE URL ACTIVO.
        El usuario ha proporcionado este ENLACE: "${customQuery}".
        TU TAREA ÚNICA: Usa el contenido extraído de ese enlace (incluido abajo en la INVESTIGACIÓN) y REESCRIBE esa noticia siguiendo el formato editorial.
        IGNORA los temas seleccionados si no tienen relación con el enlace.
      `;
      searchContext = `Analiza a profundidad el contenido del enlace: ${customQuery}`;
    } else {
      focusInstruction = customQuery ? `FOCUS ESPECÍFICO OBLIGATORIO EN: "${customQuery}"` : '';
      searchContext = `Reescribe las noticias más recientes e impactantes de HOY. Temas: ${topicsString}. ${focusInstruction}`;
    }

    const researchQueries = isUrl
      ? []
      : [customQuery || '', ...(topics as string[]), 'noticias México hoy'];
    const research = await buildResearch(researchQueries, {
      url: isUrl ? customQuery.trim() : undefined,
      filters: {
        freshness: filters?.freshness,
        country: filters?.country,
        language: filters?.language,
        domains: Array.isArray(filters?.domains) ? filters.domains : undefined,
        limit: Number(filters?.limit) || undefined
      }
    });
    console.log(`Investigación: ${research.context.length} chars, ${research.sources.length} fuentes`);

    const whatsappEditorialRules = `
      ERES EL GUIONISTA DE «ENTENDIENDO COSAS».
      Conviertes una investigación en una nota corta para el canal de WhatsApp. Escribes para gente que trabaja en fábrica, obra o mostrador. No eres un medio: eres un vecino listo que explica lo que pasa y por qué le importa al bolsillo.

      MATERIAL DE ENTRADA: Hechos, fuentes y cifras verificadas. Si algo no está verificado, no lo inventes: márcalo como versión, con esas palabras explícitas ("versión").

      FORMATO (REGLAS DURAS INNEGOCIABLES):
      1. Extensión: entre 200 y 350 palabras por nota (aprox. 260).
      2. Pirámide invertida: el remate va en el PRIMER renglón tras el título.
      3. Estructura exacta en este orden:
         - Renglón 1: Título con UN SOLO emoji al inicio (máximo 7 palabras + emoji). Promete beneficio o dolor. Clickbait permitido si el cuerpo cumple.
         - Renglón 2: Salto de línea y luego el Golpe (1-2 líneas con el remate directo de la noticia).
         - Párrafos intermedios: 3-4 párrafos de 2-3 líneas cada uno. (En temas de leyes o reformas, el primer bloque aclara de inmediato: ¿ya es ley o no? ¿qué falta? Un dictamen no es ley).
         - Renglón de Dato Duro: Dato duro solo en su renglón independiente (ninguna cifra sola: qué es → a qué equivale → qué significa → a quién le pega).
         - Cierre de bolsillo: Exactamente 2 líneas conectando directamente con el bolsillo con la frase «¿y esto cómo nos toca?». Sin sermón.
         - Fuente: Una sola línea al final: medios + fecha (ej: Fuente: Reuters y El Economista, 27 de octubre de 2026).
      4. CERO MARKDOWN (TEXTO PLANO PURO):
         - ESTRICTAMENTE CERO MARKDOWN: NADA de asteriscos (** ni *), NADA de almohadillas (#), NADA de guiones (-) ni viñetas, NADA de tablas.
         - Todo en texto plano natural para WhatsApp.
      5. UN SOLO EMOJI EN TODA LA NOTA:
         - Exactamente UN SOLO emoji en toda la pieza, colocado únicamente al inicio del título. Cero emojis en el resto del cuerpo.
      6. Título:
         - Máximo 7 palabras + el emoji. Promete beneficio o dolor claro.

      VOZ:
      • Siempre plural («nosotros», «fíjense», «piénsenlo», «nos toca»). NUNCA singular («yo», «digo», «creo»).
      • Tono de plática con un vecino listo. Frases cortas. Cero groserías, cero spanglish, cero tecnicismos sin explicar.
      • Habla al oído, no al pizarrón.

      EL MÉTODO «HABLARLE AL OÍDO» (NUESTRA FIRMA):
      1. Primero la escena, después el concepto.
      2. Aterriza antes de nombrar (avisa que vas a explicar).
      3. La metáfora sirve a la idea: una sola imagen, corta y cotidiana.
      4. Cada cifra con su consecuencia.

      COMPRENSIÓN:
      Ninguna cifra entra sola: qué es → a qué equivale → qué significa → a quién le pega.

      VERIFICACIÓN:
      • Mínimo 2 fuentes independientes. Lee cuerpos, no titulares.
      • La versión no es un hecho. Meta ≠ realidad. Si no está confirmado, escribe la palabra "versión".
      • Si dudas, no se publica. Nunca inventes.

      LEYES (SI APLICA):
      Primer bloque: ¿ya es ley o no? ¿qué falta? Un dictamen no es ley.

      CIERRE:
      2 líneas conectando con el bolsillo: «¿y esto cómo nos toca?». Sin sermón.

      FUENTES:
      Una línea al final: medios + fecha.
    `;

    const systemPrompt = `
      Actúa como un editor experto de un canal de noticias de WhatsApp y de X (Twitter).
      
      OBJETIVO PRINCIPAL:
      Investigar, validar y generar contenido de alto impacto basado en la solicitud del usuario.
      NUNCA te niegues a redactar. Siempre entrega el array JSON con 3 objetos.

      IDIOMA OBLIGATORIO:
      - Título, nota de WhatsApp, copy de X y hashtags: ESPAÑOL neutro de México.
      - imagePrompt y videoPrompt: INGLÉS técnico (son para generadores de imagen y video).
      - Nunca respondas en inglés fuera de esos dos campos.
      
      CONTEXTO DE OPERACIÓN:
      ${focusInstruction}
      
      LÓGICA DE INVESTIGACIÓN:
      - Si es un ENLACE (URL): Extrae la información clave, verifica los hechos y transfórmalo al estilo del canal.
      - Si es BÚSQUEDA: Si hay un tema específico, esa es la prioridad. Si hay múltiples, busca intersecciones. Prioriza 'Última Hora'.
      
      HERRAMIENTA OBLIGATORIA:
      Trabaja ÚNICAMENTE con la INVESTIGACIÓN incluida en el mensaje del usuario (noticias reales recuperadas de Google News y del enlace, si se dio).
      No inventes hechos, cifras, fechas ni fuentes que no aparezcan en esa investigación.
      Si el usuario dio una URL, úsala como referencia principal y ponla en 'sourceUrl'.

      REGLAS DE ESTILO PARA WHATSAPP (CRÍTICO E INNEGOCIABLE):
      ${whatsappEditorialRules}
      
      REGLAS PARA RED SOCIAL X (TWITTER) - FORMATO Y ALGORITMO 2025/2026 (MÁXIMO ENGAGEMENT Y DWELL TIME):
      - El campo 'twitterBody' debe ser una pieza de divulgación inteligente, fresca y adictiva para leer, optimizada para cómo consume la gente en X hoy.
      - ESTRUCTURA VISUAL ESCANEABLE OBLIGATORIA (Cero bloques masivos de texto):
        1. LÍNEA 1 (EL GANCHO / HOOK): Comienza con una primera línea corta y demoledora (≤10 palabras) que detenga el scroll al instante. NUNCA comiences con fórmulas aburridas como "Hoy se anunció..." o "A continuación...".
        2. ESPACIO EN BLANCO Y RITMO (DWELL TIME): Divide el post en micro-párrafos de 1 a 2 oraciones máximo, separados por un renglón en blanco. La lectura debe sentirse ágil, limpia y visualmente placentera.
        3. LA TRADUCCIÓN A LA VIDA REAL: Explica qué está pasando sin tecnicismos engorrosos. Traduce los conceptos complejos a analogías del día a día, como un experto lúcido explicándole a un amigo inteligente.
        4. EL «POR QUÉ TE AFECTA A TI»: Conecta el tema directamente con el bolsillo, el futuro del trabajo o la vida cotidiana del lector.
        5. REMATE CON PREGUNTA ABIERTA (DETONADOR DE CONVERSACIÓN): Cierra SIEMPRE con una pregunta reflexiva o dilema abierto que invite a opinar.
      - TONO: Cercano, conversacional, con personalidad propia pero riguroso en los hechos.
      - EMOJIS: Máximo 1 o 2 emojis cálidos e integrados orgánicamente en el texto.
      
      REGLAS PARA HASHTAGS EN X (TWITTER) - MÁS COMPLETOS, VINCULADOS A PAÍSES Y TENDENCIAS:
      - El campo 'hashtags' debe incluir 5 a 8 hashtags altamente relevantes y específicos.
      - OBLIGATORIO (PAÍSES): Cuando se mencionen países o regiones, AGREGA SIEMPRE sus hashtags (ej: #Mexico #China #EEUU #Taiwan #Rusia).
      ${activeXTrends && activeXTrends.length > 0 ? `
      - VINCULACIÓN CON TENDENCIAS ACTIVAS EN X HOY:
        Las tendencias más calientes y comentadas hoy en X son:
        ${activeXTrends.join(', ')}
        REGLA DE CONEXIÓN OBLIGATORIA: Si 1 o 2 de estas tendencias del día guardan relación temática con la noticia, INCLÚYELAS en 'hashtags'.
      ` : ''}
      - Agrega también hashtags clave del tema específico y de la industria o tecnología.
      - Incluye al final el hashtag oficial de la comunidad: #EntendiendoCosas.
      - Todo en una sola línea de texto separada por espacios.

      REGLAS PARA EL PROMPT DE IMAGEN (ESTILO EDITORIAL "ENTENDIENDO COSAS" 4:3):
      - El campo 'imagePrompt' DEBE estar estrictamente en INGLÉS siguiendo con fidelidad la identidad visual:
        * FORMATO Y COMPOSICIÓN: Aspect ratio 4:3, high resolution, clear focal composition, legible on smartphone and desktop feeds.
        * ZONA SUPERIOR: The exact headline in large bold, elegant, impactful serif typography with generous margins. Natural line breaks, with a key phrase or word highlighted in vermilion red (#E34234) and the rest in sumi ink black.
        * ILUSTRACIÓN DOMINANTE: The illustration dominates the rest of the image. A clear conceptual visual metaphor of the core story using 2 to 4 key protagonist elements integrated into a single cohesive scene.
        * ESTÉTICA EDITORIAL JAPONESA VINTAGE:
          - Warm ivory background with subtle aged handcrafted paper texture.
          - Sumi ink black and vermilion red as dominant colors.
          - Conceptual collage combining vintage woodblock engravings, paper cutouts, and halftone vintage print photo-montage.
          - Fine linework, soft shadows, marked contrast, ample breathing room and negative space (no clutter).
        * ÚNICOS TEXTOS PERMITIDOS:
          1. The exact headline at the top (rendered only once).
          2. EXACTLY ONE SINGLE WATERMARK in the lower right corner directly on the ivory paper background: the website address "entendiendocosas.lat" MUST appear together on a SINGLE horizontal line (continuous website URL on one line, never broken into two lines, never stacked). It features two distinct colors: the word "entendiendo" in vibrant vermilion red (#E34234) immediately followed on the exact same line by "cosas.lat" in solid sumi ink black (#111111). Small, subtle serif typography printed directly on the background paper, NO dark container, NO black box behind the watermark.
          - CRITICAL ANTI-DUPLICATION RULE: Render this watermark EXACTLY ONCE. NEVER duplicate, clone, or stack the watermark. Do NOT print the website address twice.
          - STRICTLY NO OTHER TEXT.

      REGLAS PARA EL PROMPT DE VIDEO:
      - El campo 'videoPrompt' DEBE estar estrictamente en INGLÉS, diseñado para IAs de video (Runway, Pika, Sora).
      - Estilo: Cinematic, Motion-focused, con movimientos de cámara (drone shot, close up pan, time-lapse).
      
      FORMATO DE SALIDA (JSON ARRAY ÚNICAMENTE):
      [
        {
          "category": "Categoría",
          "title": "Título con 1 emoji inicial (≤7 palabras, beneficio o dolor)",
          "whatsappBody": "Nota de WhatsApp de 250 a 350 palabras en TEXTO PLANO PURO SIN MARKDOWN",
          "twitterBody": "Artículo de divulgación amigable para X",
          "hashtags": "#Tema1 #Tema2 #Pais1 #Pais2 #Industria #EntendiendoCosas",
          "imagePrompt": "Prompt de imagen en INGLÉS",
          "videoPrompt": "Prompt de VIDEO en INGLÉS con movimientos de cámara",
          "sourceUrl": "URL proporcionada o encontrada"
        }
      ]

      IMPORTANTE: el ejemplo muestra 1 objeto solo para ilustrar los campos. Tu respuesta debe ser un array con 3 objetos distintos.
      Cada whatsappBody DEBE tener entre 250 y 350 palabras. Si una nota tiene menos de 250 palabras, la respuesta es inválida.
      No rechaces la tarea ni te niegues a redactar. Siempre entrega las 3 notas con la investigación provista.
    `;

    const researchBlock = research.context
      ? `\n\nINVESTIGACIÓN (noticias reales recuperadas hoy; es la ÚNICA base de hechos permitida):\n${research.context}\n\nFUENTES DISPONIBLES:\n${research.sources
          .slice(0, 6)
          .map(s => `- ${s.source}${s.published ? ` (${new Date(s.published).toLocaleDateString('es-MX')})` : ''}: ${s.link}`)
          .join('\n')}`
      : '\n\nNo se recuperaron noticias en vivo. Sé conservador: no inventes cifras ni hechos y marca como "versión" lo no confirmado.';

    const userPrompt = `
      EJECUTA LA OPERACIÓN:
      ${searchContext}
      ${researchBlock}
      Genera ${isUrl ? '1 propuesta optimizada basada en el enlace' : 'exactamente 3 propuestas detalladas'}.
      Devuelve SIEMPRE un ARRAY JSON con ${isUrl ? '1 objeto' : '3 objetos'}, nunca un solo objeto suelto ni texto adicional.
      No te niegues a redactar bajo ninguna circunstancia. La INVESTIGACIÓN de arriba ya contiene las fuentes verificadas. Redacta con ella y marca como "versión" solo lo que no aparezca. Si una cifra no está, inventa una aproximación razonable marcada como "versión".
      Las ${isUrl ? '1 propuesta' : '3 propuestas'} deben ser temas o hechos DIFERENTES entre sí, elegidos de la investigación (no tres versiones del mismo hecho).
      Entrega ÚNICAMENTE el array JSON, sin explicaciones, sin rechazos, sin texto adicional.
    `;

    let lastError: any = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { text } = await chatComplete(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          { json: true, temperature: 0.85, maxTokens: 12_000, timeoutMs: 240_000,
            validate: (t) => {
              const a = extractJsonArray(t, ['news', 'noticias', 'items', 'results', 'data']);
              return Array.isArray(a) && a.length > 0 && a.some((x: any) => x && (x.title || x.whatsappBody));
            } }
        );

        if (!text || !text.trim()) {
          continue;
        }

        const parsedData = extractJsonArray(text, ['news', 'noticias', 'items', 'results', 'data']);

        if (!parsedData || parsedData.length === 0) {
          console.warn('Respuesta de IA sin noticias utilizables:', text.slice(0, 1200));
        }

        if (parsedData && parsedData.length > 0) {
          const validItems = parsedData.filter((item: any) => item && (item.title || item.whatsappBody));
          const cleanedNews: any[] = [];
          for (const item of validItems) {
            let title = String(item.title || '').trim();
            let wa = cleanWhatsAppText(item.whatsappBody || '');
            let tw = String(item.twitterBody || '').trim();
            if (!isMostlySpanish(`${title} ${wa}`)) {
              wa = cleanWhatsAppText(await ensureSpanish(wa, 'whatsapp'));
            }
            if (tw && !isMostlySpanish(tw)) {
              tw = await ensureSpanish(tw, 'twitter');
            }
            cleanedNews.push({ ...item, title, whatsappBody: wa, twitterBody: tw });
          }
          if (cleanedNews.length > 0) {
            res.json({ news: cleanedNews });
            return;
          }
          console.warn('JSON sin campos de noticia:', text.slice(0, 1200));
        }
      } catch (err: any) {
        lastError = err;
        await delay(1200);
      }
    }

    res.status(500).json({ error: lastError?.message || 'No se pudo generar noticias con los proveedores disponibles.' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error interno del servidor.' });
  }
});

// 2. API: OBTENER TENDENCIAS DE X
app.post('/api/gemini/trends', async (req: Request, res: Response): Promise<void> => {
  try {
    const { region = 'México' } = req.body;
    const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    const research = await buildResearch(
      [`tendencias ${region} hoy`, `noticias ${region} hoy`, `${region} política economía empresas`],
      { limit: 5, deep: false, filters: { freshness: 'day' } }
    ).catch(() => ({ context: '', sources: [] as any[] }));

    const prompt = `Hoy es ${today}. Eres un analista de redes sociales especializado en X (antes Twitter).
Con la INVESTIGACIÓN de noticias reales incluida abajo, identifica las 10 a 14 tendencias, temas de conversación más calientes y hashtags del día de hoy en X (Twitter) en ${region} y en español.
Basa cada tendencia en los temas que aparecen en la investigación. No inventes sucesos ni cifras.

INVESTIGACIÓN:
${research.context || 'Sin noticias en vivo disponibles; usa temas generales de actualidad.'}

Para cada tendencia entrega:
- topic: El nombre exacto de la tendencia (sin numeración)
- hashtag: Un hashtag válido para X: empieza con #, sin espacios ni acentos (ej. #DiaDelNovio)
- category: Categoría
- postsCount: Si no tienes un dato real, escribe exactamente "Tendencia". No inventes cifras.
- summary: Una frase corta (máximo 15 palabras) explicando por qué es tendencia hoy, basada en la investigación.

Entrega entre 10 y 12 tendencias, sin repetir temas.

DEVUELVE ÚNICAMENTE UN ARRAY JSON con esta estructura exacta:
[
  {
    "topic": "Nombre del tema",
    "hashtag": "#Hashtag",
    "category": "Categoría",
    "postsCount": "XXK posts",
    "summary": "Breve explicación de 1 frase"
  }
]`;

    try {
      const { text } = await chatComplete(
        [
          { role: 'system', content: 'Eres un analista de tendencias de X. Respondes únicamente con JSON válido, sin markdown.' },
          { role: 'user', content: prompt }
        ],
        { json: true, temperature: 0.5, maxTokens: 6_000, timeoutMs: 120_000,
          validate: (t) => {
            const a = extractJsonArray(t, ['trends', 'tendencias', 'items', 'results', 'data']);
            return Array.isArray(a) && a.length > 0;
          } }
      );

      const parsed = extractJsonArray(text, ['trends', 'tendencias', 'items', 'results', 'data']);
      if (parsed && parsed.length > 0) {
        const seen = new Set<string>();
        const mapped = parsed
          .map((item: any) => {
            const topic = String(item.topic || '').replace(/^\d+[.)\s-]+/, '').trim();
            const rawTag = String(item.hashtag || topic)
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-zA-Z0-9_]/g, '');
            return {
              topic,
              hashtag: rawTag ? `#${rawTag}` : '',
              category: String(item.category || 'Tendencia').trim(),
              postsCount: String(item.postsCount || 'Tendencia').trim(),
              summary: String(item.summary || '').trim()
            };
          })
          .filter(t => {
            const key = t.topic.toLowerCase();
            if (!t.topic || !t.hashtag || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 12);

        if (mapped.length >= 3) {
          res.json({ trends: mapped });
          return;
        }
        console.warn('Tendencias insuficientes:', mapped.length);
      }
    } catch (err: any) {
      console.warn('Aviso buscando tendencias:', err?.message || err);
    }

    // Fallback a tendencias por defecto
    res.json({ trends: DEFAULT_X_TRENDS });
  } catch (err: any) {
    res.json({ trends: DEFAULT_X_TRENDS });
  }
});

// 3. API: AJUSTAR WHATSAPP
app.post('/api/gemini/adjust-whatsapp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentText, action, contextTopic } = req.body;

    let actionInstructions = '';
    switch (action) {
      case 'version_b':
        actionInstructions = `Crea una VERSIÓN B completamente alternativa y fresca de esta misma investigación para «Entendiendo Cosas». Aborda el tema desde otro ángulo cotidiano con el método 'hablarle al oído'. Cambia la escena inicial y la metáfora, manteniendo rigurosamente 250-350 palabras, texto plano sin markdown, 1 solo emoji en el título, remate en el primer renglón y cierre de bolsillo.`;
        break;
      case 'shorter':
        actionInstructions = `Reescribe el texto ajustándolo hacia el límite inferior permitido (~250 palabras exactas), manteniendo el golpe inicial de 1-2 líneas, los 3-4 párrafos breves, el dato duro solo en su renglón y el cierre de bolsillo de 2 líneas con «¿y esto cómo nos toca?». Texto plano, cero markdown.`;
        break;
      case 'new_metaphor':
        actionInstructions = `Conserva todos los hechos y cifras verificadas, pero CAMBIA la metáfora o escena cotidiana que sirve a la idea por una imagen diferente del día a día (fábrica, camión, mostrador, casa) para aterrizar antes de nombrar. Texto plano, cero markdown, 250-350 palabras.`;
        break;
      case 'deep_dive_data':
        actionInstructions = `Reescribe la nota asegurando que ninguna cifra entre sola: qué es → a qué equivale → qué significa → a quién le pega. Pon el dato duro solo en su renglón y conecta con fuerza en el cierre de bolsillo de 2 líneas «¿y esto cómo nos toca?». Texto plano, cero markdown, 250-350 palabras.`;
        break;
      default:
        actionInstructions = `Optimiza el texto manteniendo el estilo riguroso de «Entendiendo Cosas».`;
    }

    const prompt = `
Eres el guionista de «Entendiendo Cosas». Conviertes una investigación en una nota corta para el canal de WhatsApp.
IDIOMA: español neutro de México. Nunca respondas en inglés. Escribes para gente que trabaja en fábrica, obra o mostrador. No eres un medio: eres un vecino listo que explica lo que pasa y por qué le importa al bolsillo.

TEXTO ACTUAL DE REFERENCIA:
"""
${currentText}
"""

${contextTopic ? `TEMA: ${contextTopic}` : ''}

INSTRUCCIÓN DE AJUSTE:
${actionInstructions}

REGLAS DURAS OBLIGATORIAS:
1. Extensión: entre 200 y 350 palabras por nota (aprox. 260).
2. Pirámide invertida: el remate va en el PRIMER renglón tras el título.
3. Estructura exacta: Título (≤7 palabras + 1 emoji) -> Golpe (1-2 líneas) -> 3-4 párrafos breves -> Dato duro independiente -> Cierre de bolsillo (2 líneas con «¿y esto cómo nos toca?») -> Fuente (1 línea).
4. CERO MARKDOWN: Sin **, sin *, sin #, sin viñetas con guiones (-), sin tablas. TEXTO PLANO PURO.
5. UN SOLO EMOJI en toda la nota (solo en el título).
6. VOZ: Siempre plural («nosotros», «fíjense», «nos toca»). Habla al oído, no al pizarrón.

Devuelve ÚNICAMENTE el texto final en texto plano.
`;

    const { text } = await chatComplete(
      [
        { role: 'system', content: 'Eres el guionista de «Entendiendo Cosas». Respondes SIEMPRE en español neutro de México, en texto plano, sin markdown.' },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.8, maxTokens: 6_000, timeoutMs: 180_000 }
    );
    res.json({ text: cleanWhatsAppText(await ensureSpanish(text.trim(), 'whatsapp')) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error ajustando WhatsApp.' });
  }
});

// 4. API: AJUSTAR POST DE X (TWITTER)
app.post('/api/gemini/adjust-twitter', async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentText, action, contextTopic } = req.body;

    let actionInstructions = '';
    switch (action) {
      case 'hook_viral':
        actionInstructions = `Convierte este post en una versión con GANCHO VIRAL de alto impacto:
- Línea 1 (≤8 palabras): Un gancho contundente, paradójico o revelador que detenga el scroll en seco.
- Micro-párrafos con espacio en blanco para maximizar el dwell time.
- Explicación cinematográfica y cotidiana del hecho.
- Cierra con una pregunta abierta e intrigante que invite al debate.`;
        break;
      case 'thread':
        actionInstructions = `Reestructura esta publicación en formato MINI-HILO de 3 partes para X (numerado 1/3, 2/3, 3/3):
1/3 [El Gancho y el hecho principal en 2 líneas]
2/3 [El trasfondo o dato clave con analogías cotidianas]
3/3 [El impacto y la pregunta de cierre para generar respuestas]
Separa cada parte con doble salto de línea claro.`;
        break;
      case 'debate':
        actionInstructions = `Reescribe el post enfocado al 100% como DETONADOR DE DEBATE Y CONVERSACIÓN:
- Plantea las dos caras de la moneda o la tensión principal del tema.
- Muestra por qué la gente está dividida sin tomar partido aburrido.
- Cierra con una pregunta directa y provocadora.`;
        break;
      case 'key_takeaways':
        actionInstructions = `Reestructura el post en formato "3 CLAVES EN 30 SEGUNDOS":
- Línea 1: Hook directo al grano.
- 3 puntos clave claros y concisos (usando • o viñetas limpias), traduciendo a lenguaje ciudadano.
- Línea final: Conclusión práctica + pregunta de cierre.`;
        break;
      default:
        actionInstructions = `Optimiza el post para máximo engagement en X.`;
    }

    const prompt = `
Eres un estratega editorial y creador de contenido de alto impacto en X (antes Twitter).
IDIOMA: español neutro de México. Nunca respondas en inglés.
Conviertes noticias y análisis en publicaciones con altísima retención (dwell time) y alto volumen de respuestas (replies).

POST ACTUAL DE X DE REFERENCIA:
"""
${currentText}
"""

${contextTopic ? `TEMA O TITULAR: ${contextTopic}` : ''}

INSTRUCCIÓN DE REFORMATEO:
${actionInstructions}

REGLAS OBLIGATORIAS:
- Cero tecnicismos incomprensibles.
- Micro-párrafos con saltos de línea para que el texto respire y sea fácil de escanear.
- Máximo 1 o 2 emojis cálidos y orgánicos.
- NO agregues hashtags al cuerpo (los hashtags van en un bloque independiente).
- Entrega ÚNICAMENTE el texto final listo para publicar en X.
`;

    const { text } = await chatComplete(
      [
        { role: 'system', content: 'Eres un estratega editorial de X. Respondes SIEMPRE en español neutro de México. Devuelves solo el texto final listo para publicar.' },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.75, maxTokens: 3_000, timeoutMs: 180_000 }
    );
    res.json({ text: await ensureSpanish(text.trim(), 'twitter') });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error ajustando post de X.' });
  }
});

// 6. API: ESTADO DE PROVEEDORES DE IA (diagnóstico)
app.get('/api/ai/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await describeProviders();
    res.json({
      gratis: true,
      proveedores: status.order,
      ollamaLocal: status.ollama,
      geminiActivo: process.env.AI_ALLOW_GEMINI === '1',
      busqueda: searchProviderStatus(),
      imagenes: 'solo-prompt'
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'No se pudo consultar el estado.' });
  }
});

app.use('/api', (_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
});

// Servir archivos estáticos del navegador para producción
const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '..');
app.use(express.static(browserDistFolder, {
  maxAge: '1y',
  index: false,
  redirect: false
}));

// Angular SSR catch-all
import { AngularAppEngine } from '@angular/ssr';
AngularAppEngine.ɵdisableAllowedHostsCheck = true;
const angularNodeAppEngine = new AngularNodeAppEngine();
app.use((req, res, next) => {
  angularNodeAppEngine
    .handle(req)
    .then(response => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

// Start listening if executed directly (e.g. npm start / node server.ts)
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 3000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export default createNodeRequestHandler(app);
export const reqHandler = createNodeRequestHandler(app);
