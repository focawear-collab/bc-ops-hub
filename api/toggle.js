// api/toggle.js — Enable/disable GitHub Actions workflow (Basic Auth required)
// POST { workflowId: number, action: "enable" | "disable" }

const { checkAuth } = require('./_auth.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth gate
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.status || 401).json(auth.error);

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const { workflowId, action } = req.body || {};
  if (!workflowId) return res.status(400).json({ error: 'workflowId is required' });
  if (action !== 'enable' && action !== 'disable') {
    return res.status(400).json({ error: 'action must be "enable" or "disable"' });
  }

  const repo = 'focawear-collab/bc-automations';

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/${action}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (resp.status === 204) {
      return res.json({ success: true, workflowId, action, newState: action === 'enable' ? 'active' : 'disabled_manually' });
    }

    const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` }));
    res.status(resp.status).json({ error: err.message || `HTTP ${resp.status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
