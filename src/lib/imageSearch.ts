import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0'
];

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function sanitizeSearchQuery(rawQuery: string): string {
  if (!rawQuery) return '';
  let q = rawQuery.trim();

  // 1. Remove leading numbering / bullet / tender markers (e.g. "1.", "1)", "№2.", "Лот 3:", "Позиция 4 - ")
  q = q.replace(/^[\d\s\.\)\-#№:]+/, '');
  q = q.replace(/^(?:лот|позиция|пункт|товар|номер|no|item)\s*[№#\d\.\-\s]*[:\.\-]?\s*/i, '');

  // 2. Remove brackets content (often specs, weights, codes)
  q = q.replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ');

  // 3. Remove tender stopwords, standard markers, and technical noise
  q = q.replace(/(?:^|\s)(?:арт|артикул|код|code|sku|штрихкод)\.?\s*[:\s]*[\w\d\-\/]+/gi, ' ');
  q = q.replace(/(?:^|\s)(?:гост|ту)\s*[\d\.\-]+/gi, ' ');
  q = q.replace(/(?:^|\s)(?:или\s+аналог|не\s+менее|не\s+более|согласно\s+тз|по\s+гост|в\s+сборе|в\s+комплекте|комплект\s+из)(?:\s|$)/gi, ' ');
  q = q.replace(/(?:^|\s)(?:штук[а-я]*|шт\.?|упаков[а-я]*|уп\.?|рулон[а-я]*|бухт[а-я]*|метр[а-я]*|компл\.?)(?:\s|$)/gi, ' ');

  // 4. Remove special tender math symbols
  q = q.replace(/[≤≥~±_#*«»"“”„]/g, ' ');

  // 5. Clean extra spaces & dashes
  q = q.replace(/\s*-\s*/g, ' ');
  q = q.replace(/\s+/g, ' ').trim();

  // 6. If query is too long, take the first 6 key words (e.g. Type + Brand + Model)
  const words = q.split(' ');
  if (words.length > 6) {
    q = words.slice(0, 6).join(' ');
  }

  return q || rawQuery.trim().substring(0, 60);
}

// Helper to extract simplified keywords if detailed query yields 0 results
function getSimplifiedQuery(query: string): string {
  const clean = sanitizeSearchQuery(query);
  const words = clean.split(' ').filter(w => w.length > 1);
  if (words.length > 3) {
    // Keep first 3 words (usually Category + Brand + Model)
    return words.slice(0, 3).join(' ');
  }
  return clean;
}

export interface ImageResult {
  url: string;
  thumb: string;
  title: string;
  source?: string;
}

async function searchBingAsync(cleanQuery: string): Promise<ImageResult[]> {
  const url = `https://www.bing.com/images/async?q=${encodeURIComponent(cleanQuery)}&first=1&count=35&mmasync=1`;
  const ua = getRandomUA();
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.bing.com/',
        'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 6500
    });

    const $ = cheerio.load(res.data);
    const images: ImageResult[] = [];

    $('.iusc').each((_, el) => {
      try {
        const m = $(el).attr('m');
        if (m) {
          const json = JSON.parse(m);
          if (json.murl) {
            images.push({
              url: json.murl,
              thumb: json.turl || json.murl,
              title: (json.t || cleanQuery).replace(/<[^>]+>/g, '').trim(),
              source: 'bing'
            });
          }
        }
      } catch {}
    });

    // Fallback: parse raw regex for murl
    if (images.length === 0) {
      const html = res.data;
      const murlMatches = [...html.matchAll(/"murl"\s*:\s*"([^"]+)"/g)];
      const turlMatches = [...html.matchAll(/"turl"\s*:\s*"([^"]+)"/g)];
      for (let i = 0; i < murlMatches.length; i++) {
        const murl = murlMatches[i]?.[1];
        const turl = turlMatches[i]?.[1] || murl;
        if (murl) {
          images.push({ url: murl, thumb: turl, title: cleanQuery, source: 'bing' });
        }
      }
    }

    return images;
  } catch (e: any) {
    console.warn('Bing async search error:', e.message);
    return [];
  }
}

async function searchBingStandard(cleanQuery: string): Promise<ImageResult[]> {
  try {
    const bingUrl = 'https://www.bing.com/images/search?q=' + encodeURIComponent(cleanQuery) + '&form=HDRSC2&first=1';
    const res = await axios.get(bingUrl, {
      headers: {
        'User-Agent': getRandomUA(),
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://www.bing.com/'
      },
      timeout: 6500
    });

    const $ = cheerio.load(res.data);
    const images: ImageResult[] = [];

    $('.iusc').each((_, el) => {
      try {
        const m = $(el).attr('m');
        if (m) {
          const json = JSON.parse(m);
          if (json.murl) {
            images.push({
              url: json.murl,
              thumb: json.turl || json.murl,
              title: (json.t || cleanQuery).replace(/<[^>]+>/g, ''),
              source: 'bing-std'
            });
          }
        }
      } catch {}
    });

    return images;
  } catch (e: any) {
    console.warn('Bing standard search error:', e.message);
    return [];
  }
}

async function searchOpenverse(cleanQuery: string): Promise<ImageResult[]> {
  try {
    const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(cleanQuery)}&page_size=20`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'TenderSearch/2.0' },
      timeout: 5000
    });
    const results = res.data?.results || [];
    return results
      .filter((r: any) => r.url && (r.url.startsWith('http://') || r.url.startsWith('https://')))
      .map((r: any) => ({
        url: r.url,
        thumb: r.thumbnail || r.url,
        title: r.title || cleanQuery,
        source: 'openverse'
      }));
  } catch (e: any) {
    return [];
  }
}

export async function searchImages(query: string): Promise<ImageResult[]> {
  const cleanQuery = sanitizeSearchQuery(query);
  if (!cleanQuery) return [];

  // Deduplication helper
  const deduplicate = (list: ImageResult[]): ImageResult[] => {
    const seen = new Set<string>();
    return list.filter(img => {
      if (!img.url || seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });
  };

  // 1. Primary: Bing Async search with clean query
  let results = await searchBingAsync(cleanQuery);
  if (results.length > 0) return deduplicate(results);

  // 2. Secondary: Bing Standard search
  results = await searchBingStandard(cleanQuery);
  if (results.length > 0) return deduplicate(results);

  // 3. Fallback: If query was complex, retry with simplified keywords (Type + Brand)
  const simplified = getSimplifiedQuery(query);
  if (simplified && simplified !== cleanQuery) {
    results = await searchBingAsync(simplified);
    if (results.length > 0) return deduplicate(results);

    results = await searchBingStandard(simplified);
    if (results.length > 0) return deduplicate(results);
  }

  // 4. Final Fallback: Openverse
  results = await searchOpenverse(cleanQuery);
  if (results.length > 0) return deduplicate(results);

  return [];
}
