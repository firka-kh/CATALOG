import axios from 'axios';
import * as cheerio from 'cheerio';

function sanitizeSearchQuery(rawQuery: string): string {
  if (!rawQuery) return '';
  let q = rawQuery.trim();
  // Remove brackets like (арт. 123) or [код 45] or {сфера: ...}
  q = q.replace(/[\(\[\{].*?[\)\]\}]/g, ' ');
  // Remove technical symbols and redundant quotes
  q = q.replace(/[«»""''`]/g, ' ');
  // Replace multiple whitespace with a single space
  q = q.replace(/\s+/g, ' ').trim();
  return q || rawQuery.trim();
}

export interface ImageSearchResult {
  url: string;
  thumb: string;
  title: string;
  domain?: string;
}

export async function searchImages(query: string): Promise<ImageSearchResult[]> {
  const cleanQuery = sanitizeSearchQuery(query);
  if (!cleanQuery) return [];

  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  const collected: ImageSearchResult[] = [];
  const seenUrls = new Set<string>();

  const addImage = (url: string, thumb: string, title: string) => {
    if (!url || seenUrls.has(url)) return;
    if (url.startsWith('data:') || url.length < 10) return;
    seenUrls.add(url);
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.replace(/^www\./, '');
      collected.push({
        url,
        thumb: thumb || url,
        title: (title || cleanQuery).replace(/<[^>]+>/g, '').trim(),
        domain,
      });
    } catch {
      collected.push({
        url,
        thumb: thumb || url,
        title: (title || cleanQuery).replace(/<[^>]+>/g, '').trim(),
      });
    }
  };

  // 1. Try Bing Images Async / Standard Search
  try {
    const bingUrl =
      'https://www.bing.com/images/search?q=' +
      encodeURIComponent(cleanQuery) +
      '&form=HDRSC2&first=1';
    const res = await axios.get(bingUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        Referer: 'https://www.bing.com/',
      },
      timeout: 6000,
    });

    const $ = cheerio.load(res.data);

    $('.iusc').each((_, el) => {
      try {
        const m = $(el).attr('m');
        if (m) {
          const json = JSON.parse(m);
          if (json.murl) {
            addImage(json.murl, json.turl || json.murl, json.t || cleanQuery);
          }
        }
      } catch {}
    });

    if (collected.length === 0) {
      const html = res.data;
      const murlMatches = [...html.matchAll(/"murl"\s*:\s*"([^"]+)"/g)];
      const turlMatches = [...html.matchAll(/"turl"\s*:\s*"([^"]+)"/g)];
      for (let i = 0; i < murlMatches.length; i++) {
        const murl = murlMatches[i]?.[1];
        const turl = turlMatches[i]?.[1] || murl;
        if (murl) {
          addImage(murl, turl, cleanQuery);
        }
      }
    }
  } catch (e: any) {
    console.warn('Bing image search notice:', e.message);
  }

  // 2. Try Google Images if fewer than 15 results
  if (collected.length < 15) {
    try {
      const googleUrl =
        'https://www.google.com/search?tbm=isch&q=' +
        encodeURIComponent(cleanQuery);
      const res = await axios.get(googleUrl, {
        headers: {
          'User-Agent': userAgent,
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 6000,
      });

      const html = res.data;
      const matches = [
        ...html.matchAll(
          /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))",\s*\d+,\s*\d+\]/gi,
        ),
      ];

      for (const m of matches) {
        const imgUrl = m[1];
        if (
          imgUrl &&
          !imgUrl.includes('gstatic.com') &&
          !imgUrl.includes('google.com')
        ) {
          addImage(imgUrl, imgUrl, cleanQuery);
        }
      }
    } catch (e: any) {
      console.warn('Google image search fallback notice:', e.message);
    }
  }

  return collected;
}

