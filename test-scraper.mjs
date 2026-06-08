import axios from 'axios';
import * as cheerio from 'cheerio';

async function searchYahooImages(query) {
    const url = `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
        }
    });

    const $ = cheerio.load(data);
    const images = [];
    $('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && src.startsWith('http')) {
            images.push({ url: src });
        }
    });
    return images;
}

searchYahooImages('Автоматический прибор для снятия гель-лака').then(res => console.log(res.slice(0, 3))).catch(console.error);
