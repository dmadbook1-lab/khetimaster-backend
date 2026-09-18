import ArticleCache from '../models/ArticleCache.js';

import fetchPIBArticles from './sources/pibService.js';
import fetchICARArticles from './sources/icarService.js';
import fetchFAOArticles from './sources/faoService.js';

import normalizeArticle from './articleNormalizer.js';
import deduplicateArticles from './articleDeduplicator.js';

let refreshInProgress = null;

export async function refreshArticles() {
  if (refreshInProgress) {
    console.log(
      'Article refresh already running. Reusing current refresh...'
    );

    return refreshInProgress;
  }

  refreshInProgress = performArticleRefresh();

  try {
    return await refreshInProgress;
  } finally {
    refreshInProgress = null;
  }
}

async function performArticleRefresh() {
  console.log('----------------------------------------');
  console.log('Starting agriculture article refresh...');

  const results = await Promise.allSettled([
    fetchPIBArticles(),
    fetchICARArticles(),
    fetchFAOArticles(),
  ]);

  const allArticles = [];

  const sourceNames = [
    'PIB',
    'ICAR',
    'FAO',
  ];

  results.forEach((result, index) => {
    const source = sourceNames[index];

    if (result.status === 'fulfilled') {
      console.log(
        `${source}: ${result.value.length} articles`
      );

      allArticles.push(...result.value);
    } else {
      console.error(
        `${source} failed:`,
        result.reason?.message || result.reason
      );
    }
  });

  console.log(
    `Total fetched articles: ${allArticles.length}`
  );

  /*
   * Important:
   *
   * If all sources fail, do NOT destroy the
   * existing cache.
   */
  if (!allArticles.length) {
    const active = await countActiveArticles();

    console.log(
      'No articles fetched from any source.'
    );

    console.log(
      'Existing cache will be preserved.'
    );

    return {
      fetched: 0,
      deduplicated: 0,
      saved: 0,
      active,
    };
  }

  const deduplicated =
    deduplicateArticles(allArticles);

  console.log(
    `After deduplication: ${deduplicated.length}`
  );

  let saved = 0;

  for (const rawArticle of deduplicated) {
    try {
      const article = normalizeArticle(rawArticle);

      if (
        !article.title ||
        !article.sourceUrl
      ) {
        continue;
      }

      await ArticleCache.updateOne(
        {
          sourceUrl: article.sourceUrl,
        },
        {
          $set: {
            title: article.title,
            description: article.description,
            source: article.source,
            imageUrl: article.imageUrl,
            category: article.category,
            publishedAt: article.publishedAt,
          },

          /*
           * These values are set ONLY when
           * the article is first inserted.
           *
           * Therefore refreshing an article
           * every 30 minutes does NOT extend
           * its 4-day lifetime forever.
           */
          $setOnInsert: {
            cachedAt: article.cachedAt,
            expiresAt: article.expiresAt,
          },
        },
        {
          upsert: true,
        }
      );

      saved++;
    } catch (error) {
      console.error(
        'Failed to save article:',
        rawArticle?.sourceUrl,
        error.message
      );
    }
  }

  /*
   * Keep maximum 100 active articles.
   */
  await enforceArticleLimit();

  /*
   * Remove expired documents explicitly as well.
   *
   * MongoDB TTL deletion is asynchronous, so
   * this keeps the active collection clean
   * immediately.
   */
  await removeExpiredArticles();

  const active =
    await countActiveArticles();

  console.log(`Saved/updated: ${saved}`);
  console.log(
    `Active cached articles: ${active}`
  );

  console.log(
    'Agriculture article refresh completed.'
  );

  console.log('----------------------------------------');

  return {
    fetched: allArticles.length,
    deduplicated: deduplicated.length,
    saved,
    active,
  };
}

export async function getLatestArticles({
  limit = 20,
  category = null,
}) {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    50
  );

  const query = {
    expiresAt: {
      $gt: new Date(),
    },
  };

  if (category) {
    query.category = String(category).trim();
  }

  return ArticleCache.find(query)
    .sort({
      publishedAt: -1,
    })
    .limit(safeLimit)
    .select(
      '_id title description source sourceUrl imageUrl category publishedAt'
    )
    .lean();
}

export async function getArticleStats() {
  const activeFilter = {
    expiresAt: {
      $gt: new Date(),
    },
  };

  const total =
    await ArticleCache.countDocuments(
      activeFilter
    );

  const bySource =
    await ArticleCache.aggregate([
      {
        $match: activeFilter,
      },
      {
        $group: {
          _id: '$source',
          count: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          count: -1,
        },
      },
    ]);

  const byCategory =
    await ArticleCache.aggregate([
      {
        $match: activeFilter,
      },
      {
        $group: {
          _id: '$category',
          count: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          count: -1,
        },
      },
    ]);

  return {
    total,
    bySource,
    byCategory,
  };
}

async function enforceArticleLimit() {
  const limit =
    Number(process.env.ARTICLE_CACHE_LIMIT) || 100;

  const activeArticles =
    await ArticleCache.find({
      expiresAt: {
        $gt: new Date(),
      },
    })
      .sort({
        publishedAt: -1,
      })
      .select('_id')
      .lean();

  if (activeArticles.length <= limit) {
    return;
  }

  const idsToKeep = activeArticles
    .slice(0, limit)
    .map((article) => article._id);

  await ArticleCache.deleteMany({
    expiresAt: {
      $gt: new Date(),
    },

    _id: {
      $nin: idsToKeep,
    },
  });

  console.log(
    `Article cache trimmed to maximum ${limit} active articles.`
  );
}

async function removeExpiredArticles() {
  await ArticleCache.deleteMany({
    expiresAt: {
      $lte: new Date(),
    },
  });
}

async function countActiveArticles() {
  return ArticleCache.countDocuments({
    expiresAt: {
      $gt: new Date(),
    },
  });
}