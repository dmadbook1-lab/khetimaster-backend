import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.fao.org';

const LIST_URL =
  process.env.FAO_NEWS_URL || `${BASE_URL}/newsroom/en`;

const MAX_CANDIDATES = 20;
const DETAIL_CONCURRENCY = 5;

function cleanText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function absoluteUrl(value, baseUrl) {
  if (!value) return null;

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function cleanImageUrl(value, baseUrl) {
  if (!value) return null;

  const url = absoluteUrl(value, baseUrl);

  if (!url) return null;

  const lower = url.toLowerCase();

  if (
    lower.startsWith('data:') ||
    lower.includes('logo') ||
    lower.includes('icon') ||
    lower.includes('favicon') ||
    lower.endsWith('.svg')
  ) {
    return null;
  }

  return url;
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function detectCategory(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();

  if (
    text.includes('climate') ||
    text.includes('drought') ||
    text.includes('flood') ||
    text.includes('weather') ||
    text.includes('disaster') ||
    text.includes('el niño') ||
    text.includes('la niña')
  ) {
    return 'weather';
  }

  if (
    text.includes('livestock') ||
    text.includes('dairy') ||
    text.includes('cattle') ||
    text.includes('animal') ||
    text.includes('herder') ||
    text.includes('poultry')
  ) {
    return 'livestock';
  }

  if (
    text.includes('fish') ||
    text.includes('fisheries') ||
    text.includes('aquaculture')
  ) {
    return 'fisheries';
  }

  if (
    text.includes('market') ||
    text.includes('price') ||
    text.includes('trade') ||
    text.includes('food price') ||
    text.includes('commodity')
  ) {
    return 'markets';
  }

  if (
    text.includes('technology') ||
    text.includes('innovation') ||
    text.includes('digital') ||
    text.includes('research') ||
    text.includes('artificial intelligence') ||
    text.includes('precision agriculture')
  ) {
    return 'technology';
  }

  if (
    text.includes('crop') ||
    text.includes('rice') ||
    text.includes('wheat') ||
    text.includes('maize') ||
    text.includes('farmer') ||
    text.includes('farming') ||
    text.includes('agriculture') ||
    text.includes('agrifood') ||
    text.includes('food security') ||
    text.includes('fertilizer') ||
    text.includes('fertiliser') ||
    text.includes('soil')
  ) {
    return 'crops';
  }

  return 'agriculture';
}

function isLikelyArticleUrl(articleUrl) {
  if (!articleUrl) return false;

  try {
    const parsed = new URL(articleUrl);

    if (!parsed.hostname.endsWith('fao.org')) {
      return false;
    }

    const path = parsed.pathname.toLowerCase();

    return (
      path.includes('/newsroom/detail/') ||
      path.includes('/newsroom/story/') ||
      path.includes('/newsroom/blog/')
    );
  } catch {
    return false;
  }
}

function getMetaContent($, selectors = []) {
  for (const selector of selectors) {
    const value = $(selector).first().attr('content');

    if (value && cleanText(value)) {
      return cleanText(value);
    }
  }

  return null;
}

function extractPublishedDate($) {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[name="publish-date"]',
    'meta[name="date"]',
    'meta[property="og:updated_time"]',
    'time[datetime]',
  ];

  for (const selector of selectors) {
    const element = $(selector).first();

    if (!element.length) {
      continue;
    }

    const value =
      element.attr('content') ||
      element.attr('datetime') ||
      element.text();

    const date = parseDate(value);

    if (date) {
      return date;
    }
  }

  const dateCandidates = [
    $('.date').first().text(),
    $('.published').first().text(),
    $('.publish-date').first().text(),
    $('[class*="date"]').first().text(),
  ];

  for (const candidate of dateCandidates) {
    const date = parseDate(cleanText(candidate));

    if (date) {
      return date;
    }
  }

  return null;
}

function extractArticleDescription($, title) {
  const metaDescription = getMetaContent($, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);

  if (metaDescription && metaDescription !== title) {
    return metaDescription.slice(0, 800);
  }

  const paragraphs = [];

  $('main p, article p, .content p').each(
    (_, element) => {
      const text = cleanText($(element).text());

      if (text.length >= 60) {
        paragraphs.push(text);
      }
    }
  );

  if (paragraphs.length) {
    return paragraphs[0].slice(0, 800);
  }

  return title;
}

async function fetchArticleDetails(articleUrl, fallbackTitle) {
  try {
    const response = await axios.get(articleUrl, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 KhetiMaster Agriculture Reader',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const $ = cheerio.load(response.data);

    const metaTitle = getMetaContent($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]);

    const h1Title = cleanText(
      $('h1').first().text()
    );

    const title =
      metaTitle ||
      h1Title ||
      fallbackTitle;

    if (!title || title.length < 10) {
      return null;
    }

    const description = extractArticleDescription($, title);

    const imageValue = getMetaContent($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ]);

    let imageUrl = cleanImageUrl(imageValue, articleUrl);

    if (!imageUrl) {
      $('main img, article img, .content img').each(
        (_, element) => {
          if (imageUrl) return;

          const src =
            $(element).attr('src') ||
            $(element).attr('data-src') ||
            $(element).attr('data-lazy-src');

          const candidate = cleanImageUrl(
            src,
            articleUrl
          );

          if (candidate) {
            imageUrl = candidate;
          }
        }
      );
    }

    const publishedAt =
      extractPublishedDate($) || new Date();

    return {
      title: cleanText(title).slice(0, 300),
      description: cleanText(description).slice(0, 800),
      source: 'FAO',
      sourceUrl: articleUrl,
      imageUrl,
      category: detectCategory(title, description),
      publishedAt,
    };
  } catch (error) {
    console.error(
      `FAO article detail failed: ${articleUrl}`,
      error.message
    );

    return null;
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let currentIndex = 0;

  async function worker() {
    while (true) {
      const index = currentIndex++;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await mapper(items[index]);
      } catch {
        results[index] = null;
      }
    }
  }

  const workers = Array.from(
    {
      length: Math.min(concurrency, items.length),
    },
    () => worker()
  );

  await Promise.all(workers);

  return results;
}

async function fetchFAOArticles() {
  console.log('Fetching FAO Newsroom...');

  const response = await axios.get(LIST_URL, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 KhetiMaster Agriculture Reader',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  console.log('FAO HTTP status:', response.status);

  const $ = cheerio.load(response.data);

  const candidates = [];
  const seen = new Set();

  $('a[href]').each((_, element) => {
    const title = cleanText($(element).text());
    const href = $(element).attr('href');

    if (!title || !href) return;

    if (title.length < 20 || title.length > 300) {
      return;
    }

    const articleUrl = absoluteUrl(href, LIST_URL);

    if (!isLikelyArticleUrl(articleUrl)) {
      return;
    }

    const normalizedUrl = articleUrl.replace(/\/$/, '');

    if (seen.has(normalizedUrl)) {
      return;
    }

    seen.add(normalizedUrl);

    candidates.push({
      title,
      url: normalizedUrl,
    });
  });

  console.log(
    `FAO discovered ${candidates.length} candidate URLs`
  );

  const limitedCandidates = candidates.slice(
    0,
    MAX_CANDIDATES
  );

  const detailedArticles = await mapWithConcurrency(
    limitedCandidates,
    DETAIL_CONCURRENCY,
    async (candidate) =>
      fetchArticleDetails(candidate.url, candidate.title)
  );

  const articles = detailedArticles.filter(Boolean);

  console.log(
    `FAO returned ${articles.length} real article candidates`
  );

  return articles;
}

export default fetchFAOArticles;