import cron from 'node-cron';

import {
  refreshArticles,
} from '../services/articleService.js';

export function startArticleRefreshJob() {
  const minutes =
    Number(
      process.env
        .ARTICLE_REFRESH_MINUTES
    ) || 30;

  const cronExpression =
    `*/${minutes} * * * *`;

  console.log(
    `Article refresh job scheduled every ${minutes} minutes`
  );

  cron.schedule(
    cronExpression,
    async () => {
      console.log(
        'Scheduled article refresh started...'
      );

      try {
        await refreshArticles();

        console.log(
          'Scheduled article refresh completed.'
        );
      } catch (error) {
        console.error(
          'Scheduled article refresh failed:',
          error
        );
      }
    }
  );
}