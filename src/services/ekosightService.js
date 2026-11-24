import axios from 'axios';

/*
 * Ekosight soil testing partner API.
 *
 *   POST /partner-v2/booking                    -> creates booking, issues sample IDs
 *   GET  /partner-v2/reportdata/sampleid/:id    -> final report (404 until finalised)
 *
 * Env: EKOSIGHT_BASE_URL, EKOSIGHT_API_KEY (the key never leaves the server).
 */

export const isConfigured = () =>
  Boolean(String(process.env.EKOSIGHT_BASE_URL ?? '').trim()) &&
  Boolean(String(process.env.EKOSIGHT_API_KEY ?? '').trim());

const client = () =>
  axios.create({
    baseURL: String(process.env.EKOSIGHT_BASE_URL).trim().replace(/\/+$/, ''),
    headers: { 'x-api-key': String(process.env.EKOSIGHT_API_KEY).trim() },
    timeout: 20000,
  });

// Booking response (confirmed against the QA API):
//   { success: true, message: '...', samples: ['S0009872'] }
// The other names are accepted too in case the shape differs elsewhere.
const ID_KEYS = new Set(['samples', 'sample_id', 'sampleid', 'sample_code', 'samplecode', 'sample_ids', 'sampleids']);

export const extractSampleIds = (value, found = []) => {
  if (Array.isArray(value)) {
    value.forEach((v) => extractSampleIds(v, found));
  } else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (ID_KEYS.has(key.toLowerCase().replace(/[-\s]/g, ''))) {
        (Array.isArray(v) ? v : [v]).forEach((x) => {
          if (typeof x === 'string' || typeof x === 'number') found.push(String(x));
        });
      } else {
        extractSampleIds(v, found);
      }
    }
  }
  return [...new Set(found)];
};

export async function createBooking(sample, fieldOfficerId) {
  const body = { data: [sample] };
  if (fieldOfficerId) body.metadata = { field_officer_id: fieldOfficerId };
  const { data } = await client().post('/partner-v2/booking', body);
  return { raw: data, sampleIds: extractSampleIds(data) };
}

// The API answers 200 with { report_status: 'P', message: 'Report under
// processing' } while the sample is still being tested (the guide only
// mentions 404), so a response only counts as a report once it is final.
export const isFinalReport = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (data.report_status !== undefined) return data.report_status === 'S';
  return ['nitrogen', 'phosphorus', 'potassium', 'ph'].some(
    (k) => data[k] !== undefined && data[k] !== null && data[k] !== '',
  );
};

// Returns the final report, or null while it is not ready yet.
export async function fetchReport(sampleId) {
  try {
    const { data } = await client().get(
      `/partner-v2/reportdata/sampleid/${encodeURIComponent(sampleId)}`,
    );
    return isFinalReport(data) ? data : null;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}
