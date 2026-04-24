// api/trigger.js — Dispara un workflow via workflow_dispatch
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const { workflowId, date } = req.body || {};
  if (!workflowId) return res.status(400).json({ error: 'workflowId is required' });

  const repo = 'focawear-collab/bc-automations';
  const inputs = date ? { date } : {};

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs }),
      }
    );

    if (resp.status === 204) {
      return res.json({ success: true });
    }

    const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` }));
    res.status(resp.status).json({ error: err.message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
