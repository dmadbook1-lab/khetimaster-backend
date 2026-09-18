function deduplicateArticles(articles) {
  const seenUrls = new Set();

  return articles.filter((article) => {
    if (!article.sourceUrl) {
      return false;
    }

    const normalizedUrl =
      article.sourceUrl
        .trim()
        .replace(/\/$/, '');

    if (seenUrls.has(normalizedUrl)) {
      return false;
    }

    seenUrls.add(normalizedUrl);

    return true;
  });
}

export default deduplicateArticles;