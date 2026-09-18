import axios from 'axios';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
});

const agricultureKeywords = [
  'agriculture',
  'agricultural',
  'farmer',
  'farmers',
  'farming',
  'farm',
  'crop',
  'crops',
  'kisan',
  'krishi',
  'horticulture',
  'fertilizer',
  'fertiliser',
  'irrigation',
  'soil',
  'pesticide',
  'pesticides',
  'seed',
  'seeds',
  'wheat',
  'rice',
  'maize',
  'cotton',
  'sugarcane',
  'pulses',
  'millets',
  'soybean',
  'soyabean',
  'groundnut',
  'mustard',
  'onion',
  'potato',
  'tomato',
  'vegetable',
  'livestock',
  'dairy',
  'fisheries',
  'fishery',
  'fishermen',
  'food processing',
  'agri technology',
  'agricultural technology',
  'agricultural research',
  'pm kisan',
  'pm-kisan',
  'kisan samman nidhi',
  'minimum support price',
  'msp',
  'mandi',
];

function cleanText(text = '') {
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isAgricultureArticle(item) {
  const text = `
    ${item.title || ''}
    ${item.contentSnippet || ''}
    ${item.content || ''}
  `.toLowerCase();

  return agricultureKeywords.some((keyword) =>
    text.includes(keyword)
  );
}

function detectCategory(item) {
  const text = `
    ${item.title || ''}
    ${item.contentSnippet || ''}
    ${item.content || ''}
  `.toLowerCase();

  if (
    text.includes('scheme') ||
    text.includes('yojana') ||
    text.includes('pm kisan') ||
    text.includes('government')
  ) {
    return 'government';
  }

  if (
    text.includes('weather') ||
    text.includes('rain') ||
    text.includes('monsoon') ||
    text.includes('climate')
  ) {
    return 'weather';
  }

  if (
    text.includes('technology') ||
    text.includes('innovation') ||
    text.includes('research') ||
    text.includes('digital')
  ) {
    return 'technology';
  }

  if (
    text.includes('market') ||
    text.includes('price') ||
    text.includes('mandi') ||
    text.includes('msp')
  ) {
    return 'markets';
  }

  if (
    text.includes('fish') ||
    text.includes('fisheries') ||
    text.includes('fishermen')
  ) {
    return 'fisheries';
  }

  if (
    text.includes('dairy') ||
    text.includes('livestock') ||
    text.includes('cattle')
  ) {
    return 'livestock';
  }

  if (
    text.includes('rice') ||
    text.includes('wheat') ||
    text.includes('maize') ||
    text.includes('cotton') ||
    text.includes('sugarcane') ||
    text.includes('crop')
  ) {
    return 'crops';
  }

  return 'agriculture';
}

async function fetchPIBArticles() {
  const url = process.env.PIB_RSS_URL;

  if (!url) {
    throw new Error(
      'PIB_RSS_URL is not configured'
    );
  }

  console.log('Fetching PIB RSS...');

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent':
        'KhetiMaster/1.0 Agriculture News Reader',
      Accept:
        'application/rss+xml, application/xml, text/xml, */*',
    },
    responseType: 'text',
  });

  const feed = await parser.parseString(
    response.data
  );

  console.log(
    `PIB returned ${feed.items?.length || 0} items`
  );

  if (!feed.items?.length) {
    return [];
  }

  return feed.items
    .filter(isAgricultureArticle)
    .map((item) => ({
      title: cleanText(item.title),

      description: cleanText(
        item.contentSnippet ||
          item.content ||
          ''
      ).slice(0, 600),

      source: 'PIB',

      sourceUrl:
        item.link ||
        item.guid ||
        '',

      imageUrl:
        item.enclosure?.url || null,

      category: detectCategory(item),

      publishedAt:
        item.isoDate ||
        item.pubDate ||
        new Date(),
    }))
    .filter(
      (article) => article.sourceUrl
    );
}

export default fetchPIBArticles;