function normalizeArticle(article) {
  const now = new Date();

  const cacheDays =
    Number(process.env.ARTICLE_CACHE_DAYS) || 4;

  const publishedDate = new Date(
    article.publishedAt
  );

  const validPublishedDate =
    !Number.isNaN(publishedDate.getTime())
      ? publishedDate
      : now;

  return {
    title: String(
      article.title || ''
    )
      .trim()
      .slice(0, 300),

    description: String(
      article.description || ''
    )
      .trim()
      .slice(0, 800),

    source: article.source,

    sourceUrl: String(
      article.sourceUrl || ''
    )
      .trim(),

    imageUrl:
      article.imageUrl || null,

    category:
      article.category || 'agriculture',

    publishedAt:
      validPublishedDate,

    cachedAt: now,

    /*
     * The article gets its lifetime when
     * first inserted.
     *
     * articleService uses $setOnInsert,
     * so this does not get extended on
     * subsequent refreshes.
     */
    expiresAt: new Date(
      now.getTime() +
        cacheDays *
          24 *
          60 *
          60 *
          1000
    ),
  };
}

export default normalizeArticle;