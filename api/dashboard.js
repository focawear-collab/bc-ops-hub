module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const repo = 'focawear-collab/bc-automations';
  const branch = 'reports';

  try {
    const files = await ghFetch(`/repos/${repo}/contents/output?ref=${branch}`, token);
    if (!Array.isArray(files)) throw new Error('Invalid file listing');

    const whatsappFile = findLatest(files, /^WhatsApp_Briefing_(\d{2})-(\d{2})-(\d{4})\.txt$/, ddmmyyyyKey);
    const googleFile   = findLatest(files, /^google_reviews_\d{4}-\d{2}-\d{2}\.json$/, nameKey);
    const uberFile     = findLatest(files, /^uber_reviews_\d{4}-\d{2}-\d{2}\.json$/, nameKey);
    const ventasFile   = findLatest(files, /^BC_Ventas_Sem\d+/, nameKey);

    const [daily, google, uber, weekly] = await Promise.all([
      whatsappFile ? fetchText(whatsappFile.download_url).then(parseWhatsApp) : null,
      googleFile   ? fetchJSON(googleFile.download_url) : null,
      uberFile     ? fetchJSON(uberFile.download_url) : null,
      ventasFile   ? fetchJSON(ventasFile.download_url) : null,
    ]);

    res.json({
      daily,
      google_reviews: google ? {
        generated_at: google.generated_at,
        periodo: google.periodo,
        bc1: { rating: google.bc1?.rating, total_reviews: google.bc1?.total_reviews, reviews_7d: google.bc1?.reviews_7d, negativas_7d: google.bc1?.negativas_7d, sin_responder: google.bc1?.sin_responder },
        bc2: { rating: google.bc2?.rating, total_reviews: google.bc2?.total_reviews, reviews_7d: google.bc2?.reviews_7d, negativas_7d: google.bc2?.negativas_7d, sin_responder: google.bc2?.sin_responder },
      } : null,
      uber_reviews: uber ? {
        generated_at: uber.generated_at,
        pending: uber.pending_negatives_count || 0,
        new_today: uber.new_negatives_today_count || 0,
        expiring: uber.expiring_negatives_count || 0,
        responded_today: uber.responded_today || 0,
        urgent: (uber.pending_negatives || []).filter(r => (r.dias_restantes || 0) <= 3).slice(0, 5),
      } : null,
      weekly: weekly ? {
        week_num: weekly.week_num,
        start_date: weekly.start_date,
        end_date: weekly.end_date,
        total_presencial: weekly.total_presencial,
        prev_total_presencial: weekly.prev_total_presencial,
        stores: (weekly.stores || []).map(s => ({
          store_name: s.store || s.store_name,
          total_presencial: s.totals?.sales || s.total_presencial,
          kpis: Object.fromEntries(
            (s.products || []).map(p => [p.name, {
              actual: p.units, benchmark: p.benchmark,
              prev: p.prev_units, gap: p.gap_vs_meta,
            }])
          ),
        })),
      } : null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ── Sort helpers ─────────────────────────────────────────────────────

function nameKey(f) { return f.name; }

function ddmmyyyyKey(f) {
  const m = f.name.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}${m[2]}${m[1]}` : f.name;   // → YYYYMMDD for correct sort
}

function findLatest(files, pattern, keyFn) {
  return files
    .filter(f => f.type === 'file' && pattern.test(f.name))
    .sort((a, b) => keyFn(b).localeCompare(keyFn(a)))[0] || null;
}

// ── WhatsApp parser ──────────────────────────────────────────────────

function parseWhatsApp(text) {
  const lines = text.split('\n');
  const data = { fecha: null, ventas_total: null, meta_pct: null, bc1: null, bc2: null,
                 canales: null, tipo_venta: null, alertas: [], positivo: [], meta_diaria_pct: null };

  let section = null;  // track which section we're in

  for (const line of lines) {
    // Section markers
    if (line.includes('ALERTAR'))  { section = 'alertas'; continue; }
    if (line.includes('POSITIVO')) { section = 'positivo'; continue; }
    if (line.includes('VENTAS:') || line.includes('CANALES')) { section = null; }

    // Fecha
    if (line.includes('BlackChicken |')) {
      const m = line.match(/\|\s*(.+)$/);
      if (m) data.fecha = m[1].trim();
    }

    // Ventas totales
    if (line.includes('VENTAS:')) {
      const v = line.match(/\$([\d.]+)/);
      const p = line.match(/\(([0-9,]+)%/);
      if (v) data.ventas_total = parseInt(v[1].replace(/\./g, ''), 10);
      if (p) data.meta_pct = parseFloat(p[1].replace(',', '.'));
    }

    // BC1 / BC2 breakdown
    const bcMatch = line.match(/^-\s+BC([12]):\s+\$([\d.]+)\s*\|\s*(\d+)\s*cuentas\s*\|\s*ticket\s+\$([\d.]+)/);
    if (bcMatch) {
      const loc = { ventas: parseInt(bcMatch[2].replace(/\./g,''),10), cuentas: parseInt(bcMatch[3],10), ticket: parseInt(bcMatch[4].replace(/\./g,''),10) };
      if (bcMatch[1] === '1') data.bc1 = loc; else data.bc2 = loc;
      continue;
    }

    // Canales
    const posM = line.match(/POS\s+([0-9,]+)%/);
    const uberM = line.match(/UberEats\s+([0-9,]+)%/);
    const justoM = line.match(/Justo\s+([0-9,]+)%/);
    if (posM || uberM || justoM) {
      data.canales = { pos: pf(posM), uber: pf(uberM), justo: pf(justoM) };
      continue;
    }

    // Tipo venta
    const mesaM = line.match(/Mesa\s+([0-9,]+)%/);
    const delM = line.match(/Delivery\s+([0-9,]+)%/);
    const retM = line.match(/Retiro\s+([0-9,]+)%/);
    if (mesaM || delM || retM) {
      data.tipo_venta = { mesa: pf(mesaM), delivery: pf(delM), retiro: pf(retM) };
      continue;
    }

    // Meta diaria %
    if (line.includes('meta diaria')) {
      const m = line.match(/\(([0-9,]+)%\)/);
      if (m) data.meta_diaria_pct = parseFloat(m[1].replace(',', '.'));
    }

    // Section-aware bullet items
    if (line.startsWith('- ') && section) {
      const item = line.substring(2).trim();
      if (item && section === 'alertas') data.alertas.push(item);
      if (item && section === 'positivo') data.positivo.push(item);
    }
  }

  return data;
}

function pf(m) { return m ? parseFloat(m[1].replace(',', '.')) : null; }

// ── GitHub helpers ───────────────────────────────────────────────────

async function ghFetch(path, token) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${path}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  return r.text();
}

async function fetchJSON(url) {
  const text = await fetchText(url);
  try { return JSON.parse(text); } catch { return null; }
}
