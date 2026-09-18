import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://icar.gov.in';

const LIST_URL =
  process.env.ICAR_NEWS_URL ||
  `${BASE_URL}/en/news-highlights`;

const MAX_ARTICLES = 20;
const DETAIL_CONCURRENCY = 5;

const REQUEST_TIMEOUT = 20000;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 ' +
  'KhetiMaster Agriculture Reader';

function cleanText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/**
 * Convert a relative URL into an absolute URL.
 */
function absoluteUrl(value, baseUrl) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Normalize ICAR article URLs.
 *
 * Examples:
 * http://icar.gov.in/en/example
 *      -> https://icar.gov.in/en/example
 *
 * //icar.gov.in/en/example
 *      -> https://icar.gov.in/en/example
 *
 * /en/example
 *      -> https://icar.gov.in/en/example
 */
function normalizeICARUrl(value, baseUrl = BASE_URL) {
  if (!value) {
    return null;
  }

  let url = String(value).trim();

  if (!url) {
    return null;
  }

  try {
    if (url.startsWith('//')) {
      url = `https:${url}`;
    }

    const parsed = new URL(url, baseUrl);

    // Always use HTTPS.
    parsed.protocol = 'https:';

    // Normalize hostname.
    parsed.hostname = parsed.hostname.toLowerCase();

    // ICAR official domain only.
    const allowedHosts = new Set([
      'icar.gov.in',
      'www.icar.gov.in',
    ]);

    if (!allowedHosts.has(parsed.hostname)) {
      return null;
    }

    // Use canonical ICAR hostname.
    parsed.hostname = 'icar.gov.in';

    // Remove trailing slash except root.
    let normalized = parsed.href;

    if (
      normalized.endsWith('/') &&
      parsed.pathname !== '/'
    ) {
      normalized = normalized.replace(/\/+$/, '');
    }

    return normalized;
  } catch {
    return null;
  }
}

/**
 * Validate an ICAR article URL.
 */
function isValidICARArticleUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') {
      return false;
    }

    if (parsed.hostname !== 'icar.gov.in') {
      return false;
    }

    if (!parsed.pathname.startsWith('/en/')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Clean image URLs.
 */
function cleanImageUrl(value, baseUrl) {
  if (!value) {
    return null;
  }

  const url = absoluteUrl(value, baseUrl);

  if (!url) {
    return null;
  }

  const lower = url.toLowerCase();

  if (
    lower.startsWith('data:') ||
    lower.includes('favicon') ||
    lower.includes('icon') ||
    lower.endsWith('.svg')
  ) {
    return null;
  }

  return url;
}

/**
 * Parse a date safely.
 */
function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Return the configured article cache window.
 *
 * Defaults to 4 days.
 */
function getCacheDays() {
  const days = Number(
    process.env.ARTICLE_CACHE_DAYS
  );

  if (!Number.isFinite(days) || days <= 0) {
    return 4;
  }

  return days;
}

/**
 * Check whether a publication date is acceptable.
 *
 * We only accept:
 *
 * now - cacheDays <= publishedAt <= now
 *
 * This prevents:
 * - old articles
 * - future-dated articles
 */
function isValidPublishedDate(date) {
  if (!(date instanceof Date)) {
    return false;
  }

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();

  const minimumDate = new Date(
    now.getTime() -
      getCacheDays() *
        24 *
        60 *
        60 *
        1000
  );

  return (
    date.getTime() >= minimumDate.getTime() &&
    date.getTime() <= now.getTime()
  );
}

/**
 * Detect article category.
 */
function detectCategory(
  title,
  description = ''
) {
  const text =
    `${title} ${description}`.toLowerCase();

  if (
    text.includes('fish') ||
    text.includes('fisher') ||
    text.includes('aquaculture') ||
    text.includes('hilsa')
  ) {
    return 'fisheries';
  }

  if (
    text.includes('livestock') ||
    text.includes('dairy') ||
    text.includes('cattle') ||
    text.includes('animal') ||
    text.includes('poultry') ||
    text.includes('goat') ||
    text.includes('sheep')
  ) {
    return 'livestock';
  }

  if (
    text.includes('climate') ||
    text.includes('drought') ||
    text.includes('flood') ||
    text.includes('weather') ||
    text.includes('el niño') ||
    text.includes('el nino') ||
    text.includes('disaster')
  ) {
    return 'weather';
  }

  if (
    text.includes('technology') ||
    text.includes('innovation') ||
    text.includes('research') ||
    text.includes(
      'artificial intelligence'
    ) ||
    text.includes('machine learning') ||
    text.includes('patent') ||
    text.includes('digital')
  ) {
    return 'technology';
  }

  if (
    text.includes('market') ||
    text.includes('price') ||
    text.includes('trade') ||
    text.includes('export')
  ) {
    return 'markets';
  }

  if (
    text.includes('crop') ||
    text.includes('farmer') ||
    text.includes('farming') ||
    text.includes('agriculture') ||
    text.includes('agricultural') ||
    text.includes('soil') ||
    text.includes('fertilizer') ||
    text.includes('fertiliser') ||
    text.includes('vegetable') ||
    text.includes('rice') ||
    text.includes('wheat') ||
    text.includes('maize') ||
    text.includes('millet') ||
    text.includes('mushroom') ||
    text.includes('horticulture')
  ) {
    return 'crops';
  }

  return 'agriculture';
}

/**
 * Extract meta content safely.
 */
function getMetaContent(
  $,
  selectors = []
) {
  for (const selector of selectors) {
    const value = $(selector)
      .first()
      .attr('content');

    if (value && cleanText(value)) {
      return cleanText(value);
    }
  }

  return null;
}

/**
 * Extract publication date from an ICAR article page.
 */
function extractArticleDate($) {
  /**
   * ICAR pages commonly expose visible dates such as:
   *
   * 5 August 2026, Kolkata
   *
   * The regex intentionally captures only:
   * DD Month YYYY
   */
  const pageText = cleanText(
    $('main').first().text() ||
      $('body').text()
  );

  const dateMatch = pageText.match(
    /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i
  );

  if (dateMatch) {
    const date = parseDate(
      dateMatch[1]
    );

    if (date) {
      return date;
    }
  }

  /**
   * Metadata fallbacks.
   */
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[name="publish-date"]',
    'meta[name="date"]',
    'meta[property="datePublished"]',
    'meta[name="datePublished"]',
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

  return null;
}

/**
 * Extract short article description.
 *
 * We intentionally store only a short description,
 * not the complete article body.
 */
function extractDescription(
  $,
  title
) {
  const metaDescription =
    getMetaContent($, [
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]',
    ]);

  if (
    metaDescription &&
    metaDescription.length > 20 &&
    metaDescription !== title
  ) {
    return metaDescription.slice(0, 800);
  }

  const paragraphs = [];

  $(
    'main p, article p, .field--name-body p'
  ).each((_, element) => {
    const text = cleanText(
      $(element).text()
    );

    if (
      text.length >= 60 &&
      !text
        .toLowerCase()
        .startsWith('source:')
    ) {
      paragraphs.push(text);
    }
  });

  if (paragraphs.length > 0) {
    return paragraphs[0].slice(0, 800);
  }

  return cleanText(title).slice(0, 800);
}

/**
 * Extract article image.
 */
function extractImage(
  $,
  articleUrl
) {
  /**
   * First try OpenGraph.
   */
  const ogImage = getMetaContent($, [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  ]);

  if (ogImage) {
    const image = cleanImageUrl(
      ogImage,
      articleUrl
    );

    if (image) {
      return image;
    }
  }

  /**
   * Fallback to article images.
   */
  const imageSelectors = [
    'main img',
    'article img',
    '.field--name-field-image img',
    '.field--name-body img',
  ];

  for (const selector of imageSelectors) {
    const elements = $(selector);

    for (
      let i = 0;
      i < elements.length;
      i++
    ) {
      const element = elements.eq(i);

      const src =
        element.attr('src') ||
        element.attr('data-src') ||
        element.attr('data-lazy-src');

      const image = cleanImageUrl(
        src,
        articleUrl
      );

      if (image) {
        return image;
      }
    }
  }

  return null;
}

/**
 * Fetch one ICAR article page.
 *
 * IMPORTANT:
 * We intentionally use normal HTTPS certificate
 * validation. We do NOT use rejectUnauthorized:false.
 */
async function fetchArticleDetails(
  articleUrl,
  fallbackTitle
) {
  const normalizedUrl =
    normalizeICARUrl(articleUrl);

  if (
    !normalizedUrl ||
    !isValidICARArticleUrl(
      normalizedUrl
    )
  ) {
    console.warn(
      `Skipping invalid ICAR URL: ${articleUrl}`
    );

    return null;
  }

  try {
    const response = await axios.get(
      normalizedUrl,
      {
        timeout: REQUEST_TIMEOUT,

        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml',
        },

        /**
         * Do not follow redirects to
         * non-ICAR domains.
         *
         * We manually validate redirects
         * below through validateStatus.
         */
        maxRedirects: 5,
      }
    );

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      console.warn(
        `ICAR detail returned HTTP ${response.status}: ${normalizedUrl}`
      );

      return null;
    }

    const finalUrl =
      response.request?.res?.responseUrl ||
      normalizedUrl;

    const finalICARUrl =
      normalizeICARUrl(finalUrl);

    /**
     * Don't save an article if ICAR redirects
     * somewhere outside the official domain.
     */
    if (
      !finalICARUrl ||
      !isValidICARArticleUrl(
        finalICARUrl
      )
    ) {
      console.warn(
        `ICAR article redirected outside allowed domain: ${normalizedUrl}`
      );

      return null;
    }

    const $ = cheerio.load(
      response.data
    );

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

    if (
      !title ||
      title.length < 10
    ) {
      console.warn(
        `ICAR article has no valid title: ${normalizedUrl}`
      );

      return null;
    }

    const description =
      extractDescription(
        $,
        title
      );

    const imageUrl =
      extractImage(
        $,
        finalICARUrl
      );

    const publishedAt =
      extractArticleDate($);

    /**
     * Do not silently use "now" when ICAR
     * doesn't provide a date.
     *
     * That could make old articles appear
     * as newly published.
     */
    if (!publishedAt) {
      console.warn(
        `ICAR article has no publication date: ${normalizedUrl}`
      );

      return null;
    }

    /**
     * Reject future or old articles.
     */
    if (
      !isValidPublishedDate(
        publishedAt
      )
    ) {
      console.log(
        `Skipping ICAR article outside ${getCacheDays()}-day window: ${normalizedUrl}`
      );

      return null;
    }

    return {
      title: title
        .slice(0, 300),

      description:
        description.slice(0, 800),

      source: 'ICAR',

      sourceUrl: finalICARUrl,

      imageUrl,

      category: detectCategory(
        title,
        description
      ),

      publishedAt,
    };
  } catch (error) {
    /**
     * Axios certificate errors generally
     * appear here as:
     *
     * ERR_TLS_CERT_ALTNAME_INVALID
     * UNABLE_TO_VERIFY_LEAF_SIGNATURE
     * CERT_HAS_EXPIRED
     *
     * We intentionally do NOT bypass them.
     */
    console.error(
      `ICAR detail failed: ${normalizedUrl}`,
      error.code ||
        error.message
    );

    return null;
  }
}

/**
 * Process items with limited concurrency.
 */
async function mapWithConcurrency(
  items,
  concurrency,
  mapper
) {
  if (!items.length) {
    return [];
  }

  const results = [];

  let currentIndex = 0;

  async function worker() {
    while (true) {
      const index =
        currentIndex++;

      if (
        index >= items.length
      ) {
        return;
      }

      try {
        results[index] =
          await mapper(
            items[index]
          );
      } catch (error) {
        console.error(
          'ICAR worker error:',
          error.message
        );

        results[index] = null;
      }
    }
  }

  const workerCount =
    Math.min(
      concurrency,
      items.length
    );

  const workers = Array.from(
    {
      length: workerCount,
    },
    () => worker()
  );

  await Promise.all(
    workers
  );

  return results;
}

/**
 * Fetch ICAR News & Highlights.
 */
async function fetchICARArticles() {
  console.log(
    'Fetching ICAR News & Highlights...'
  );

  /**
   * Normalize the configured list URL.
   */
  const normalizedListUrl =
    normalizeICARUrl(
      LIST_URL,
      BASE_URL
    );

  if (
    !normalizedListUrl ||
    !normalizedListUrl.includes(
      '/en/news-highlights'
    )
  ) {
    throw new Error(
      `Invalid ICAR news URL: ${LIST_URL}`
    );
  }

  let response;

  try {
    response = await axios.get(
      normalizedListUrl,
      {
        timeout: REQUEST_TIMEOUT,

        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml',
        },

        maxRedirects: 5,
      }
    );
  } catch (error) {
    console.error(
      'ICAR list request failed:',
      error.code ||
        error.message
    );

    throw error;
  }

  console.log(
    'ICAR HTTP status:',
    response.status
  );

  if (
    response.status < 200 ||
    response.status >= 300
  ) {
    throw new Error(
      `ICAR returned HTTP ${response.status}`
    );
  }

  const $ = cheerio.load(
    response.data
  );

  const candidates = [];
  const seen = new Set();

  /**
   * IMPORTANT:
   *
   * ICAR News & Highlights currently
   * contains a table:
   *
   * S.NO | Title
   *
   * We ONLY inspect links inside
   * table rows.
   *
   * This prevents navigation links such as:
   *
   * - Screen Reader Access
   * - Privacy Policy
   * - Sitemap
   * - Agricultural Education
   * - Horticultural Science
   */
  $('table tr').each(
    (_, row) => {
      const link = $(row)
        .find('a[href]')
        .first();

      if (!link.length) {
        return;
      }

      const title = cleanText(
        link.text()
      );

      const href =
        link.attr('href');

      if (
        !title ||
        !href
      ) {
        return;
      }

      if (
        title.length < 20 ||
        title.length > 300
      ) {
        return;
      }

      const articleUrl =
        normalizeICARUrl(
          href,
          normalizedListUrl
        );

      if (!articleUrl) {
        return;
      }

      if (
        !isValidICARArticleUrl(
          articleUrl
        )
      ) {
        return;
      }

      if (
        seen.has(articleUrl)
      ) {
        return;
      }

      seen.add(articleUrl);

      candidates.push({
        title,
        url: articleUrl,
      });
    }
  );

  console.log(
    `ICAR discovered ${candidates.length} actual news links`
  );

  if (!candidates.length) {
    console.warn(
      'ICAR returned no article links.'
    );

    return [];
  }

  /**
   * Only inspect the newest candidates
   * from the listing page.
   */
  const limited =
    candidates.slice(
      0,
      MAX_ARTICLES
    );

  console.log(
    `Fetching details for ${limited.length} ICAR articles...`
  );

  const details =
    await mapWithConcurrency(
      limited,
      DETAIL_CONCURRENCY,
      candidate =>
        fetchArticleDetails(
          candidate.url,
          candidate.title
        )
    );

  /**
   * Remove failed articles.
   */
  const articles =
    details.filter(Boolean);

  /**
   * Final deduplication.
   */
  const uniqueArticles = [];
  const articleUrls = new Set();

  for (const article of articles) {
    if (
      !article?.sourceUrl ||
      articleUrls.has(
        article.sourceUrl
      )
    ) {
      continue;
    }

    articleUrls.add(
      article.sourceUrl
    );

    uniqueArticles.push(
      article
    );
  }

  /**
   * Final date safety check.
   *
   * This protects the service even if
   * extraction logic changes later.
   */
  const validArticles =
    uniqueArticles.filter(
      article =>
        isValidPublishedDate(
          article.publishedAt
        )
    );

  /**
   * Newest first.
   */
  validArticles.sort(
    (a, b) =>
      new Date(
        b.publishedAt
      ).getTime() -
      new Date(
        a.publishedAt
      ).getTime()
  );

  console.log(
    `ICAR returned ${validArticles.length} valid articles`
  );

  return validArticles;
}

export default fetchICARArticles;