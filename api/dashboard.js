module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const repo = 'focawear-collab/bc-automations';
  const branch = 'reports';

  try {
    // ── Phase 1: List directories in parallel ─────────────────────────
    const [outputFiles, crFiles, ecFiles] = await Promise.all([
      ghFetch(`/repos/${repo}/contents/output?ref=${branch}`, token),
      ghFetch(`/repos/${repo}/contents/reports/checkrocket?ref=${branch}`, token).catch(() => []),
      ghFetch(`/repos/${repo}/contents/reports/estimado-compra?ref=${branch}`, token).catch(() => []),
    ]);

    if (!Array.isArray(outputFiles)) throw new Error('Invalid file listing');

    // ── Phase 2: Find latest files ────────────────────────────────────
    const whatsappFiles = outputFiles
      .filter(f => f.type === 'file' && /^WhatsApp_Briefing_(\d{2})-(\d{2})-(\d{4})\.txt$/.test(f.name))
      .sort((a, b) => ddmmyyyyKey(b).localeCompare(ddmmyyyyKey(a)));

    const latestWA     = whatsappFiles[0] || null;
    const trend7WA     = whatsappFiles.slice(0, 7);
    const googleFile   = findLatest(outputFiles, /^google_reviews_\d{4}-\d{2}-\d{2}\.json$/, nameKey);
    const uberFile     = findLatest(outputFiles, /^uber_reviews_\d{4}-\d{2}-\d{2}\.json$/, nameKey);
    const ventasFile   = findLatest(outputFiles, /^BC_Ventas_Sem\d+/, nameKey);
    const briefingHTML = findLatest(outputFiles, /^BlackChicken_Briefing_\d{2}-\d{2}-\d{4}\.html$/, ddmmyyyyKey);

    // CheckRocket: find latest per local
    const crArr = Array.isArray(crFiles) ? crFiles : [];
    const crBC1 = findLatest(crArr, /^BC1_CheckRocket_/i, nameKey);
    const crBC2 = findLatest(crArr, /^BC2_CheckRocket_/i, nameKey);

    // Estimado compra: find latest JSON
    const ecArr = Array.isArray(ecFiles) ? ecFiles : [];
    const ecJSON = findLatest(ecArr, /\.json$/i, nameKey);

    // ── Phase 3: Fetch all data in parallel ───────────────────────────
    const fetches = await Promise.all([
      latestWA    ? fetchText(latestWA.download_url).then(parseWhatsApp) : null,            // 0: daily
      googleFile  ? fetchJSON(googleFile.download_url) : null,                               // 1: google
      uberFile    ? fetchJSON(uberFile.download_url) : null,                                 // 2: uber
      ventasFile  ? fetchJSON(ventasFile.download_url) : null,                               // 3: weekly
      briefingHTML? fetchText(briefingHTML.download_url) : null,                              // 4: briefing html
      crBC1       ? fetchText(crBC1.download_url) : null,                                    // 5: cr bc1
      crBC2       ? fetchText(crBC2.download_url) : null,                                    // 6: cr bc2
      ecJSON      ? fetchJSON(ecJSON.download_url) : null,                                   // 7: estimado
      ...trend7WA.slice(1).map(f => fetchText(f.download_url).then(parseWhatsApp)),          // 8+: trends
    ]);

    const [daily, google, uber, weekly, briefingHtml, crHtml1, crHtml2, estimado] = fetches;
    const trendDays = [daily, ...fetches.slice(8)].filter(Boolean);

    // ── Phase 4: Parse additional data ────────────────────────────────
    const checkrocket = {
      bc1: crHtml1 ? parseCheckRocket(crHtml1) : null,
      bc2: crHtml2 ? parseCheckRocket(crHtml2) : null,
    };

    const briefingDetail = briefingHtml ? parseBriefingHTML(briefingHtml) : null;

    const trends = trendDays.map(d => ({
      fecha: d.fecha,
      ventas: d.ventas_total,
      bc1: d.bc1?.ventas || null,
      bc2: d.bc2?.ventas || null,
    })).reverse(); // oldest first for charts

    // Meta mensual
    const metaMensual = buildMetaMensual(daily);

    // Score operacional
    const score = buildScore(daily, checkrocket, google);

    // ── Phase 5: Build response ───────────────────────────────────────
    res.json({
      daily,
      google_reviews: google ? {
        generated_at: google.generated_at,
        periodo: google.periodo,
        bc1: pick(google.bc1, ['rating','total_reviews','reviews_7d','negativas_7d','sin_responder']),
        bc2: pick(google.bc2, ['rating','total_reviews','reviews_7d','negativas_7d','sin_responder']),
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
        prev_start_date: weekly.prev_start_date,
        prev_end_date: weekly.prev_end_date,
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
        top_by_revenue: (weekly.top_by_revenue || []).slice(0, 10),
        top_by_quantity: (weekly.top_by_quantity || []).slice(0, 10),
        weekly_garzones: (weekly.weekly_garzones || []).slice(0, 10),
        weekly_channels: weekly.weekly_channels || [],
      } : null,
      checkrocket,
      briefing_detail: briefingDetail,
      trends,
      meta_mensual: metaMensual,
      score_operacional: score,
      estimado_compra: estimado ? parseEstimado(estimado) : null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ── Helpers ─────────────────────────────────────────────────────────

function pick(obj, keys) {
  if (!obj) return null;
  return Object.fromEntries(keys.map(k => [k, obj[k]]));
}

function nameKey(f) { return f.name; }

function ddmmyyyyKey(f) {
  const m = f.name.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}${m[2]}${m[1]}` : f.name;
}

function findLatest(files, pattern, keyFn) {
  return files
    .filter(f => f.type === 'file' && pattern.test(f.name))
    .sort((a, b) => keyFn(b).localeCompare(keyFn(a)))[0] || null;
}

function pf(m) { return m ? parseFloat(m[1].replace(',', '.')) : null; }

// ── WhatsApp parser ─────────────────────────────────────────────────

function parseWhatsApp(text) {
  const lines = text.split('\n');
  const data = { fecha: null, ventas_total: null, meta_pct: null, bc1: null, bc2: null,
                 canales: null, tipo_venta: null, alertas: [], positivo: [], meta_diaria_pct: null };
  let section = null;

  for (const line of lines) {
    if (line.includes('ALERTAR'))  { section = 'alertas'; continue; }
    if (line.includes('POSITIVO')) { section = 'positivo'; continue; }
    if (line.includes('VENTAS:') || line.includes('CANALES')) { section = null; }

    if (line.includes('BlackChicken |')) {
      const m = line.match(/\|\s*(.+)$/);
      if (m) data.fecha = m[1].trim();
    }

    if (line.includes('VENTAS:')) {
      const v = line.match(/\$([\d.]+)/);
      const p = line.match(/\(([0-9,]+)%/);
      if (v) data.ventas_total = parseInt(v[1].replace(/\./g, ''), 10);
      if (p) data.meta_pct = parseFloat(p[1].replace(',', '.'));
    }

    const bcMatch = line.match(/^-\s+BC([12]):\s+\$([\d.]+)\s*\|\s*(\d+)\s*cuentas\s*\|\s*ticket\s+\$([\d.]+)/);
    if (bcMatch) {
      const loc = { ventas: parseInt(bcMatch[2].replace(/\./g,''),10), cuentas: parseInt(bcMatch[3],10), ticket: parseInt(bcMatch[4].replace(/\./g,''),10) };
      if (bcMatch[1] === '1') data.bc1 = loc; else data.bc2 = loc;
      continue;
    }

    const posM = line.match(/POS\s+([0-9,]+)%/);
    const uberM = line.match(/UberEats\s+([0-9,]+)%/);
    const justoM = line.match(/Justo\s+([0-9,]+)%/);
    if (posM || uberM || justoM) {
      data.canales = { pos: pf(posM), uber: pf(uberM), justo: pf(justoM) };
      continue;
    }

    const mesaM = line.match(/Mesa\s+([0-9,]+)%/);
    const delM = line.match(/Delivery\s+([0-9,]+)%/);
    const retM = line.match(/Retiro\s+([0-9,]+)%/);
    if (mesaM || delM || retM) {
      data.tipo_venta = { mesa: pf(mesaM), delivery: pf(delM), retiro: pf(retM) };
      continue;
    }

    if (line.includes('meta diaria')) {
      const m = line.match(/\(([0-9,]+)%\)/);
      if (m) data.meta_diaria_pct = parseFloat(m[1].replace(',', '.'));
    }

    if (line.startsWith('- ') && section) {
      const item = line.substring(2).trim();
      if (item && section === 'alertas') data.alertas.push(item);
      if (item && section === 'positivo') data.positivo.push(item);
    }
  }
  return data;
}

// ── CheckRocket HTML parser (v2 — confiable, por checklist) ────────

function parseCheckRocket(html) {
  const data = {
    score_pct: null,
    completed: null,
    total: null,
    fecha: null,
    jefe_local: null,
    checklists: [],       // [{name, status, meta, badge, category}]
    no_cumple: [],        // [{checklist, item, detail}]
    merma: [],            // [{producto, cantidad, motivo, autoriza, costo_estimado}]
    temps_fuera: [],      // [{equipo, temp, rango, estado}]
    temps_limite: [],     // [{equipo, temp, rango}]
    piloto_auto: null,    // string or null
  };

  // ── Score banner ──
  const scoreM = html.match(/(\d+)\s*\/\s*(\d+)\s*obligatori/i);
  if (scoreM) { data.completed = parseInt(scoreM[1]); data.total = parseInt(scoreM[2]); }
  // score-big">72.7%</div> ... Cumplimiento
  const pctM = html.match(/score-big[^>]*>([\d.,]+)\s*%/);
  if (pctM) data.score_pct = parseFloat(pctM[1].replace(',', '.'));

  // Fecha
  const fechaM = html.match(/<title>[^<]*?(\d{1,2}\s+\w+\s+\d{4})/i) || html.match(/(\w+\s+\d{1,2}\s+de\s+\w+\s+\d{4})/i);
  if (fechaM) data.fecha = fechaM[1].trim();

  // Jefe de local
  const jefeM = html.match(/Jefe de Local:\s*([^<]+)/i);
  if (jefeM) data.jefe_local = jefeM[1].trim();

  // ── Checklists: parse each checklist-row ──
  // Canonical checklist categorization
  const COCINA = ['Reporte de Stock', 'Cierre de Turno Cocina', 'BPM — Control de Temperatura',
    'BPM — Temperatura Pollos', 'BPM — Higiene y Salud del Personal', 'BPM — Limpieza e Higiene de Equipos',
    'Declaración de Merma', 'Cierre Diario Costillas y Lomos', 'Inventario Diario'];
  const SALON = ['Apertura de Estación', 'Turno Intermedio', 'Cierre de Estación'];
  const JEFATURAS = ['Auditoría Jefe de Local', 'CHECKLIST GENERAL'];
  const PERIODICOS = ['Calibración Termómetros', 'Cambio Aceite', 'Cambio de Aceite', 'Registro Cambio',
    'Recepción Mercadería', 'Prueba Cocina', 'Producto Agotado', 'Cliente Incógnito'];

  function categorize(name) {
    const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (COCINA.some(c => n.includes(c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').substring(0, 12)))) return 'cocina';
    if (SALON.some(c => n.includes(c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').substring(0, 8)))) return 'salon';
    if (JEFATURAS.some(c => n.includes(c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').substring(0, 8)))) return 'jefaturas';
    if (PERIODICOS.some(c => n.includes(c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').substring(0, 8)))) return 'periodicos';
    // Fallback: check for common keywords
    if (/merma|declaraci/i.test(n)) return 'cocina';
    if (/apertura|cierre.*estaci|turno.*intermedio/i.test(n)) return 'salon';
    if (/auditor|general/i.test(n)) return 'jefaturas';
    return 'cocina'; // default
  }

  // Match each checklist-row div block (class="checklist-row" in HTML, not CSS)
  const rowRe = /class="checklist-row"[\s\S]*?class="checklist-name"[^>]*>([^<]+)<[\s\S]*?class="checklist-meta"[^>]*>([^<]*)<[\s\S]*?class="badge\s+(badge-ok|badge-warn|badge-fail|badge-missing)"[^>]*>([^<]*)</g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const name = m[1].trim();
    const meta = m[2].trim();
    const badgeClass = m[3];
    const badgeText = m[4].trim();

    let status;
    if (badgeClass === 'badge-missing') {
      status = 'no_realizado';
    } else {
      status = 'realizado';
    }

    data.checklists.push({
      name,
      status,
      meta,
      badge: badgeText,
      category: categorize(name),
    });
  }

  // ── No Cumple items: parse no-cumple-item divs ──
  const ncRe = /class="no-cumple-item"[\s\S]*?font-weight:\s*500[^>]*>([^<]+)<[\s\S]*?margin-top:\s*2px[^>]*>([^<]*)</g;
  while ((m = ncRe.exec(html)) !== null) {
    data.no_cumple.push({
      item: m[1].trim(),
      detail: m[2].trim(),
    });
  }

  // ── Merma: parse merma-card divs (old format) ──
  const mermaRe = /class="merma-card"[\s\S]*?class="prod">([^<]+)<[\s\S]*?class="detail">([^<]+)/g;
  while ((m = mermaRe.exec(html)) !== null) {
    const prodLine = m[1].trim();
    const detailLine = m[2].trim();
    const cantM = prodLine.match(/([\d.,]+)\s*(g|kg|un|lt|porciones|ml)/i);
    const motivoM = detailLine.match(/Motivo:\s*([^·]+)/i);
    const autorizaM = detailLine.match(/Autoriza:\s*([^·<]+)/i);
    data.merma.push({
      producto: prodLine.replace(/\s*[—–-]\s*[\d.,]+\s*(g|kg|un|lt|porciones|ml).*/i, '').trim(),
      cantidad: cantM ? cantM[1] + cantM[2] : prodLine,
      motivo: motivoM ? motivoM[1].trim() : null,
      autoriza: autorizaM ? autorizaM[1].trim() : null,
    });
  }

  // Merma: parse merma-summary (new format with cost table)
  const mermaSumM = html.match(/class="total-cost"[^>]*>\$?([\d.,]+)/);
  if (mermaSumM) {
    data.merma_costo_total = mermaSumM[1].trim();
  }
  // Parse merma-table rows: <td>Producto</td><td class="qty">N</td><td>unit</td><td class="cost">$X</td>
  const mermaTableRe = /class="merma-table"[\s\S]*?<\/table>/;
  const mermaTblMatch = html.match(mermaTableRe);
  if (mermaTblMatch) {
    const tblHtml = mermaTblMatch[0];
    const rowRe2 = /<tr>\s*<td>([^<]+)<\/td>\s*<td[^>]*class="qty"[^>]*>([^<]+)<\/td>\s*<td>([^<]*)<\/td>(?:[\s\S]*?<td>([^<]*)<\/td>)?\s*<td[^>]*class="cost"[^>]*>([^<]+)<\/td>/g;
    let mr;
    while ((mr = rowRe2.exec(tblHtml)) !== null) {
      data.merma.push({
        producto: mr[1].trim(),
        cantidad: mr[2].trim() + ' ' + (mr[3] || '').trim(),
        motivo: mr[4] ? mr[4].trim() : null,
        autoriza: null,
        costo: mr[5].trim(),
      });
    }
  }
  // Merma count from banner
  const mermaCountM = html.match(/Merma:\s*(\d+)\s*prod/i);
  if (mermaCountM) data.merma_count = parseInt(mermaCountM[1]);

  // ── Temperaturas fuera de rango: parse ONLY "Control de Temperatura" section ──
  // Must be in a section-title (not checklist-name). Exclude "Cocción Pollos"
  const tempSectionRe = /section-title[^>]*>[^<]*Control de Temperatura[^<]*<[\s\S]*?<table class="temp-table">([\s\S]*?)<\/table>/i;
  const tempSectionMatch = html.match(tempSectionRe);
  if (tempSectionMatch) {
    const tbl = tempSectionMatch[1];
    // Parse rows with temp-crit or temp-warn classes
    const trRe = /<tr[^>]*>[\s\S]*?<td[^>]*>(?:<[^>]*>)*\s*([^<]+?)\s*(?:<[^>]*>)*<\/td>\s*<td[^>]*class="(temp-crit|temp-warn)"[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>/g;
    let tm;
    while ((tm = trRe.exec(tbl)) !== null) {
      const equipo = tm[1].trim();
      const cls = tm[2];
      const temp = tm[3].trim();
      const estado = tbl.substring(tm.index, tm.index + tm[0].length);
      // Get rango from the last <td> in the row
      const rangoM = estado.match(/<td[^>]*>([^<]*)<\/td>\s*$/);
      const rango = rangoM ? rangoM[1].trim() : '';
      if (cls === 'temp-crit') {
        data.temps_fuera.push({ equipo, temp: temp.includes('°') ? temp : temp + '°C', rango, estado: 'critico' });
      } else if (cls === 'temp-warn') {
        data.temps_limite.push({ equipo, temp: temp.includes('°') ? temp : temp + '°C', rango });
      }
    }
    // Also catch rows with inline style for critical temps (BC2 old format)
    const critRowRe = /<tr[^>]*style="background:#1a0808"[^>]*>[\s\S]*?<td[^>]*>(?:<[^>]*>)*\s*([^<]+?)\s*(?:<[^>]*>)*<\/td>\s*<td[^>]*class="temp-crit"[^>]*>([^<]+)/g;
    while ((tm = critRowRe.exec(tbl)) !== null) {
      const equipo = tm[1].trim();
      const temp = tm[2].trim();
      if (!data.temps_fuera.some(t => t.equipo === equipo)) {
        data.temps_fuera.push({ equipo, temp: temp.includes('°') ? temp : temp + '°C', rango: '', estado: 'critico' });
      }
    }
  }

  // ── Piloto automático ──
  const pilotoM = html.match(/Posible Piloto Autom[áa]tico[\s\S]*?<div[^>]*>([^<]{20,300})/i);
  if (pilotoM) data.piloto_auto = pilotoM[1].trim();

  return data;
}

// ── Briefing HTML parser ────────────────────────────────────────────

function parseBriefingHTML(html) {
  const data = { top_productos: [], garzones_bc1: [], garzones_bc2: [], garzones: [], medios_pago: [] };

  // Garzones: section "RANKING GARZONES" — now split by local (local-card divs)
  const garzSection = extractSection(html, 'RANKING GARZ', 'CHECK');
  if (garzSection) {
    // New format: two local-card divs (BC1 gold, BC2 blue) each with their own table
    const localCardRe = /local-card[^>]*>[\s\S]*?<h3[^>]*>.*?(BC1|BC2|Black Chicken #1|Black Chicken #2)[\s\S]*?<table>([\s\S]*?)<\/table>/gi;
    let lm;
    while ((lm = localCardRe.exec(garzSection)) !== null) {
      const localId = lm[1].includes('1') ? 'BC1' : 'BC2';
      const tableHtml = lm[2];
      const rowRe = /<tr[^>]*>[\s\S]*?<td[^>]*>(?:<[^>]+>)*\s*(\d+)\s*(?:<[^>]+>)*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*([^<]+?)\s*(?:<[^>]+>)*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*\$([\d.,]+)/g;
      let m;
      const targetArr = localId === 'BC1' ? data.garzones_bc1 : data.garzones_bc2;
      while ((m = rowRe.exec(tableHtml)) !== null && targetArr.length < 6) {
        const afterMatch = tableHtml.substring(m.index + m[0].length);
        const cuentasM = afterMatch.match(/<td[^>]*>\s*(?:<[^>]+>)*\s*(\d+)/);
        const ticketM = afterMatch.match(/<td[^>]*>\s*(?:<[^>]+>)*\s*\$([\d.,]+)/);
        targetArr.push({
          rank: parseInt(m[1]),
          name: m[2].replace(/<[^>]+>/g, '').trim(),
          ventas: parseInt(m[3].replace(/\./g, '').replace(',', '')),
          cuentas: cuentasM ? parseInt(cuentasM[1]) : 0,
          ticket: ticketM ? parseInt(ticketM[1].replace(/\./g, '').replace(',', '')) : 0,
          local: localId,
        });
      }
    }

    // Fallback: old format (single combined table, no local-card)
    if (!data.garzones_bc1.length && !data.garzones_bc2.length) {
      const rowRe = /<tr[^>]*>[\s\S]*?<td[^>]*>(?:<[^>]+>)*\s*(\d+)\s*(?:<[^>]+>)*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*([^<]+?)\s*(?:<[^>]+>)*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*\$([\d.,]+)/g;
      let m;
      while ((m = rowRe.exec(garzSection)) !== null && data.garzones.length < 8) {
        const afterMatch = garzSection.substring(m.index + m[0].length);
        const cuentasM = afterMatch.match(/<td[^>]*>\s*(?:<[^>]+>)*\s*(\d+)/);
        const ticketM = afterMatch.match(/<td[^>]*>\s*(?:<[^>]+>)*\s*\$([\d.,]+)/);
        data.garzones.push({
          rank: parseInt(m[1]),
          name: m[2].replace(/<[^>]+>/g, '').trim(),
          ventas: parseInt(m[3].replace(/\./g, '').replace(',', '')),
          cuentas: cuentasM ? parseInt(cuentasM[1]) : 0,
          ticket: ticketM ? parseInt(ticketM[1].replace(/\./g, '').replace(',', '')) : 0,
        });
      }
    }
  }

  // Medios de pago: section "MEDIOS DE PAGO" — bar-row divs with bar-label, bar-val
  const mediosSection = extractSection(html, 'MEDIOS DE PAGO', 'RANKING GARZ');
  if (mediosSection) {
    const barRe = /bar-label[^>]*>([^<]+)<[\s\S]*?<strong>\$([\d.,]+)<\/strong>\s*<span[^>]*>([\d.,]+%)/g;
    let m;
    while ((m = barRe.exec(mediosSection)) !== null) {
      const name = m[1].replace(/[🟣🟦🔵🏦📲🟢💵🔴⚪]/g, '').trim();
      if (name.length > 1) {
        data.medios_pago.push({
          metodo: name,
          monto: parseInt(m[2].replace(/\./g, '').replace(',', '')),
          pct: m[3],
        });
      }
    }
  }

  return data;
}

function extractSection(html, startMarker, endMarker) {
  const startRe = new RegExp(startMarker, 'i');
  const endRe = new RegExp(endMarker, 'i');
  const startIdx = html.search(startRe);
  if (startIdx === -1) return null;
  const endIdx = html.substring(startIdx + 10).search(endRe);
  return endIdx === -1 ? html.substring(startIdx) : html.substring(startIdx, startIdx + 10 + endIdx);
}

// ── Estimado Compra parser ──────────────────────────────────────────

function parseEstimado(data) {
  if (!data) return null;
  // If it's the purchase order format with items/orders
  if (data.items || data.orders) {
    return {
      fecha: data.fecha || data.date || null,
      horizonte: data.horizonte || data.horizon_days || null,
      total_items: data.total_items || (data.items || data.orders || []).length,
      urgentes: (data.items || data.orders || []).filter(i =>
        (i.status || '').toLowerCase().includes('urgente') || i.coverage_days < 1
      ).length,
      items: (data.items || data.orders || []).slice(0, 15).map(i => ({
        local: i.local || i.store,
        producto: i.producto || i.product || i.name,
        stock: i.stock || i.current_stock,
        recomendado: i.qty_recomendado || i.recommended_qty || i.qty,
        cobertura_dias: i.cobertura_dias || i.coverage_days,
        status: i.status || i.urgency,
        proveedor: i.proveedor || i.supplier,
      })),
    };
  }
  // Raw sales data (by_product_per_day) — not a purchase forecast, skip
  if (data.by_product_per_day) return null;
  return null;
}

// ── Meta mensual ────────────────────────────────────────────────────

function buildMetaMensual(daily) {
  if (!daily) return null;
  const META_TOTAL = 199000000; // $199M/mes
  const META_BC1 = 149300000;
  const META_BC2 = 49800000;

  // meta_pct from briefing is accumulated monthly %
  const acumulado = daily.meta_pct ? Math.round(META_TOTAL * daily.meta_pct / 100) : null;

  return {
    meta_total: META_TOTAL,
    meta_bc1: META_BC1,
    meta_bc2: META_BC2,
    acumulado_pct: daily.meta_pct,
    acumulado_monto: acumulado,
    dia_actual: new Date().getDate(),
    dias_mes: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
  };
}

// ── Score operacional ───────────────────────────────────────────────

function buildScore(daily, checkrocket, google) {
  // Score 0-100 based on: ventas vs meta (40%), checkrocket (35%), reviews (25%)
  let ventasScore = 0, crScore = 0, reviewScore = 0;
  let components = {};

  // Ventas: 100 if >= 100% meta diaria, proportional below
  if (daily?.meta_diaria_pct) {
    ventasScore = Math.min(100, daily.meta_diaria_pct);
    components.ventas = { value: daily.meta_diaria_pct, weight: 40 };
  }

  // CheckRocket: average of both locals (works with v2 parser)
  const crScores = [];
  for (const loc of ['bc1', 'bc2']) {
    const cr = checkrocket?.[loc];
    if (cr?.completed != null && cr?.total) {
      crScores.push((cr.completed / cr.total) * 100);
    } else if (cr?.score_pct != null) {
      crScores.push(cr.score_pct);
    }
  }
  if (crScores.length) {
    crScore = crScores.reduce((a, b) => a + b, 0) / crScores.length;
    components.checkrocket = { value: Math.round(crScore), weight: 35 };
  }

  // Reviews: based on absence of negatives (google) + low pending (uber)
  if (google) {
    const negTotal = (google.bc1?.negativas_7d || 0) + (google.bc2?.negativas_7d || 0);
    reviewScore = negTotal === 0 ? 100 : Math.max(0, 100 - negTotal * 15);
    components.reviews = { value: Math.round(reviewScore), weight: 25 };
  }

  const totalWeight = Object.values(components).reduce((s, c) => s + c.weight, 0) || 1;
  const weighted = Object.values(components).reduce((s, c) => s + (c.value * c.weight / 100), 0);
  const total = Math.round((weighted / totalWeight) * 100);

  return { total, components };
}

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
