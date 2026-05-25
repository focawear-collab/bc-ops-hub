// api/_auth.js — Shared Basic Auth helper
// Env vars: BC_OPS_USER (email), BC_OPS_PASS (password)
// Usage: const { ok, error } = checkAuth(req); if (!ok) return res.status(401).json(error);

module.exports.checkAuth = function checkAuth(req) {
  const expectedUser = process.env.BC_OPS_USER;
  const expectedPass = process.env.BC_OPS_PASS;

  if (!expectedUser || !expectedPass) {
    return { ok: false, error: { error: 'Auth not configured (BC_OPS_USER/BC_OPS_PASS missing)' }, status: 500 };
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    return { ok: false, error: { error: 'Missing credentials' }, status: 401 };
  }

  let user, pass;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const idx = decoded.indexOf(':');
    user = decoded.slice(0, idx);
    pass = decoded.slice(idx + 1);
  } catch {
    return { ok: false, error: { error: 'Invalid auth header' }, status: 401 };
  }

  if (user !== expectedUser || pass !== expectedPass) {
    return { ok: false, error: { error: 'Invalid credentials' }, status: 401 };
  }

  return { ok: true };
};
