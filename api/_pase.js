// Pase del portal BlackChicken APP (PIN una sola vez). El portal ya validó el PIN y firma:
//   sso1~persona~vence~dominio~emitido~firma   (HMAC-SHA256 con SSO_SECRET, compartido)
// vence = fin de la sesión del portal (12 h): pasada esa hora, la app vuelve a pedir el PIN.
const crypto = require('crypto');
function igual(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function hostDe(req) { return String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim().split(':')[0]; }
// maxEdadMs: cuánto puede tardar el pase en llegar desde que se emitió (0 = solo cuenta el vencimiento)
function leerPase(t, req, maxEdadMs) {
  const p = String(t || '').split('~');
  if (p.length !== 6 || p[0] !== 'sso1' || !process.env.SSO_SECRET) return null;
  const base = p.slice(0, 5).join('~');
  if (!igual(p[5], crypto.createHmac('sha256', process.env.SSO_SECRET).update(base).digest('hex'))) return null;
  const persona = Number(p[1]), hasta = Number(p[2]), emitido = Number(p[4]);
  if (!(persona > 0) || !(hasta > Date.now())) return null;
  if (p[3] !== hostDe(req)) return null;                       // el pase es para ESTA app
  if (maxEdadMs && !(Date.now() - emitido < maxEdadMs)) return null;
  return { personId: persona, hasta };
}
module.exports = { leerPase };
