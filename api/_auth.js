// api/_auth.js — Acceso con el PIN personal de bc-usuarios (header x-pin).
// ops.ver = ver dashboard y workflows · ops.ejecutar = encender/apagar crons y ejecutar workflows.
// Reemplaza el usuario/clave compartidos (BC_OPS_USER/BC_OPS_PASS) y la clave escrita en la página.
const { exigir } = require('./_bcpin');

module.exports.conPin = function conPin(handler, permiso) {
  return async function (req, res) {
    res.setHeader('Cache-Control', 'private, no-store'); // nunca cachear en el CDN datos que piden PIN
    if (req.method === 'OPTIONS') return res.status(200).end();
    const persona = await exigir(req, res, 'ops', req.headers['x-pin'], permiso);
    if (!persona) return;
    req.persona = persona;
    return handler(req, res);
  };
};
