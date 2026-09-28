let token;

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json();
}

async function getToken() {
  if (token) return token;
  const session = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'analyst@clouddash.local' })
  });
  token = session.token;
  return token;
}

export async function getDashboardMetrics() {
  const accessToken = await getToken();
  return request('/dashboard', { headers: { Authorization: `Bearer ${accessToken}` } });
}
