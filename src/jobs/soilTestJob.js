import cron from 'node-cron';

import { syncPendingSoilTests } from '../controllers/soilTestController.js';
import { isConfigured } from '../services/ekosightService.js';

// Every hour: fetch reports that finished since the last check.
export function startSoilTestJob() {
  if (!isConfigured()) {
    console.log('Soil test job skipped (EKOSIGHT_BASE_URL / EKOSIGHT_API_KEY not set)');
    return;
  }
  console.log('Soil test report job scheduled hourly');
  cron.schedule('15 * * * *', async () => {
    try {
      const r = await syncPendingSoilTests();
      if (r.checked) console.log('Soil report sync:', r);
    } catch (error) {
      console.error('Soil report sync failed:', error.message);
    }
  });
}
