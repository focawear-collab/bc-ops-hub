// api/workflows.js — Lista workflows + último run de cada uno
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const repo = 'focawear-collab/bc-automations';

  try {
    const wfData = await ghFetch(`/repos/${repo}/actions/workflows`, token);

    const enriched = await Promise.all(
      wfData.workflows.map(async (wf) => {
        const runs = await ghFetch(
          `/repos/${repo}/actions/workflows/${wf.id}/runs?per_page=1`,
          token
        );
        const last = runs.workflow_runs?.[0] || null;

        let duration = null;
        if (last?.run_started_at && last?.updated_at) {
          duration = Math.round(
            (new Date(last.updated_at) - new Date(last.run_started_at)) / 1000
          );
        }

        return {
          id: wf.id,
          name: wf.name,
          path: wf.path,
          state: wf.state,
          lastRun: last
            ? {
                status: last.status,
                conclusion: last.conclusion,
                createdAt: last.created_at,
                duration,
                url: last.html_url,
                event: last.event,
              }
            : null,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

async function ghFetch(path, token) {
  const resp = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}: ${path}`);
  return resp.json();
}
