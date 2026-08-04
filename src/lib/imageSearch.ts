import axios from 'axios';
import * as cheerio from 'cheerio';

function sanitizeSearchQuery(rawQuery: string): string {
  // Strip category/sphere tags if present, trailing technical codes like (арт. 1234), etc.
  let q = rawQuery.trim();
  // Remove brackets like (арт. 123) or [код 45]
  q = q.replace(/[\(\[\{].*?[\)\]\}]/g, '');
  // Clean extra spaces
  q = q.replace(/\s+/g, ' ').trim();
  return q || rawQuery.trim();
}

export async function searchImages(query: string) {
  const cleanQuery = sanitizeSearchQuery(query);
  if (!cleanQuery) return [];

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // 1. Try Bing Images
  try {
    const bingUrl = 'https://www.bing.com/images/search?q=' + encodeURIComponent(cleanQuery) + '&form=HDRSC2&first=1';
    const res = await axios.get(bingUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://www.bing.com/'
      },
      timeout: 7000
    });

    const $ = cheerio.load(res.data);
    const images: { url: string; thumb: string; title: string }[] = [];

    $('.iusc').each((i, el) => {
      try {
        const m = $(el).attr('m');
        if (m) {
          const json = JSON.parse(m);
          if (json.murl) {
            images.push({
              url: json.murl,
              thumb: json.turl || json.murl,
              title: (json.t || cleanQuery).replace(/<[^>]+>/g, '')
            });
          }
        }
      } catch (e) {}
    });

    if (images.length === 0) {
      const html = res.data;
      const murlMatches = [...html.matchAll(/"murl"\s*:\s*"([^"]+)"/g)];
      const turlMatches = [...html.matchAll(/"turl"\s*:\s*"([^"]+)"/g)];
      for (let i = 0; i < murlMatches.length; i++) {
        const murl = murlMatches[i]?.[1];
        const turl = turlMatches[i]?.[1] || murl;
        if (murl) {
          images.push({ url: murl, thumb: turl, title: cleanQuery });
        }
      }
    }

    if (images.length > 0) {
      const seen = new Set();
      return images.filter(img => {
        if (seen.has(img.url)) return false;
        seen.add(img.url);
        return true;
      });
    }
  } catch (e: any) {
    console.error('Bing image search error:', e.message);
  }

  // 2. Fallback: Google Images Regex
  try {
    const googleUrl = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(cleanQuery);
    const res = await axios.get(googleUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 7000
    });

    const html = res.data;
    const matches = [...html.matchAll(/\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))",\s*\d+,\s*\d+\]/gi)];
    const images = matches
      .map(m => ({ url: m[1], thumb: m[1], title: cleanQuery }))
      .filter(item => !item.url.includes('gstatic.com') && !item.url.includes('google.com'));

    if (images.length > 0) {
      const seen = new Set();
      return images.filter(img => {
        if (seen.has(img.url)) return false;
        seen.add(img.url);
        return true;
      });
    }
  } catch (e: any) {
    console.error('Google image search fallback error:', e.message);
  }

  return [];
}
