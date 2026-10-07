// Valida el PIN personal contra bc-usuarios (Supabase: app_login_v2). Lo comparten las apps BC.
// Devuelve { id, nombre, local, permisos: { 'clave.permiso': alcance } } o null.
// Quién entra y qué puede hacer se administra en bc-usuarios; acá no hay claves.
const cache = new Map();   // pin+app → persona, 5 min (evita una consulta por cada request)
const fallos = new Map();  // ip → { n, t }: freno a quien prueba PINs
const MIN = 60 * 1000;

function frenado(ip) { const f = fallos.get(ip); return !!f && f.n >= 8 && Date.now() - f.t < 10 * MIN; }
function anotarFallo(ip) { const f = fallos.get(ip); if (!f || Date.now() - f.t > 10 * MIN) fallos.set(ip, { n: 1, t: Date.now() }); else f.n++; }
const ipDe = (req) => String((req && req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'x';

async function personaPorPin(app, pin, req) {
  pin = String(pin || '').trim();
  const ip = ipDe(req);
  if (frenado(ip)) { const e = new Error('Demasiados intentos. Espera unos minutos.'); e.status = 429; throw e; }
  if (!/^\d{4,8}$/.test(pin)) { anotarFallo(ip); return null; }
  const k = app + '|' + pin, c = cache.get(k);
  if (c && Date.now() - c.t < 5 * MIN) return c.p;
  const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB || !KEY) { const e = new Error('Acceso no configurado'); e.status = 503; throw e; }
  const r = await fetch(`${SB}/rest/v1/rpc/app_login_v2`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_app: app, p_pin: pin }),
  });
  if (!r.ok) { const e = new Error('No se pudo validar el PIN'); e.status = 502; throw e; }
  const f = (await r.json())[0];
  const p = f ? { id: f.person_id, nombre: f.person_name, local: f.person_local, permisos: f.permisos || {} } : null;
  if (!p) anotarFallo(ip);
  cache.set(k, { p, t: Date.now() });
  return p;
}

// Responde 401/403/429 y devuelve null si no corresponde; si no, la persona.
async function exigir(req, res, app, pin, permiso) {
  try {
    const p = await personaPorPin(app, pin, req);
    if (!p) { res.status(401).json({ error: 'PIN incorrecto o sin acceso' }); return null; }
    if (permiso && !p.permisos[permiso]) { res.status(403).json({ error: 'Tu PIN no tiene permiso para esto' }); return null; }
    return p;
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); return null; }
}

module.exports = { personaPorPin, exigir };
