/**
 * Register a new user with the API
 * @param {string} apiUrl - Base URL of the API
 * @returns {Promise<Object>} Response with publicId, writeToken, widgetUrl
 */
export async function register(apiUrl) {
  const response = await fetch(`${apiUrl}/api/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Registration failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Sync records to the API
 * @param {string} apiUrl - Base URL of the API
 * @param {string} publicId - User's public ID
 * @param {string} writeToken - User's write token
 * @param {Array} records - Records array [{ date, model, input, output }]
 * @returns {Promise<Object>} Response with success status
 */
export async function syncRecords(apiUrl, publicId, writeToken, records) {
  const response = await fetch(`${apiUrl}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${writeToken}`,
    },
    body: JSON.stringify({
      publicId,
      records,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Sync failed: ${response.status}`);
  }

  return response.json();
}
