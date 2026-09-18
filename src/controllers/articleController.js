import {
  getLatestArticles,
  getArticleStats,
  refreshArticles,
} from '../services/articleService.js';

async function latestArticles(req, res) {
  try {
    const {
      limit = 20,
      category,
    } = req.query;

    const articles =
      await getLatestArticles({
        limit,
        category,
      });

    return res.status(200).json({
      success: true,
      count: articles.length,
      data: articles,
    });
  } catch (error) {
    console.error(
      'Latest articles error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Failed to fetch agriculture articles',
      error: error.message,
    });
  }
}

async function articleStats(req, res) {
  try {
    const stats =
      await getArticleStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error(
      'Article stats error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Failed to fetch article statistics',
      error: error.message,
    });
  }
}

async function refreshArticlesManually(
  req,
  res
) {
  try {
    const secret =
      process.env
        .ARTICLE_REFRESH_SECRET;

    const providedSecret =
      req.headers[
        'x-article-refresh-key'
      ];

    if (
      !secret ||
      providedSecret !== secret
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Unauthorized refresh request',
      });
    }

    console.log(
      'Manual article refresh started...'
    );

    const result =
      await refreshArticles();

    return res.status(200).json({
      success: true,
      message:
        'Articles refreshed successfully',
      data: result,
    });
  } catch (error) {
    console.error(
      'Manual article refresh error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Failed to refresh agriculture articles',
      error: error.message,
    });
  }
}

export {
  latestArticles,
  articleStats,
  refreshArticlesManually,
};