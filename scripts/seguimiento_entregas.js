/* Construye seguimiento_entregas.json: una fila por entrega recibida en el
   CEDIS Panamá (informe de entradas de Abasto) con su ingreso a SALMI y su
   entrada contable 101 (kardex MB51). Lo usa solicitud_cita.html para que
   cada proveedor vea el avance de sus entregas sin descargar el kardex.
   Misma regla de cruce que trazabilidad.html: pedido SAFIRO + material,
   movimiento 101 más cercano a la fecha de recepción.
   Uso: node scripts/seguimiento_entregas.js  (desde la raíz del repo) */
const fs = require('fs');
const path = require('path');
const R = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
const DESDE = '2026-05-05';
const D = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00Z').getTime();

const ent = R('entradas_recepcion.json');
const E = ent.rows.filter((e) => e.fRec && e.fRec >= DESDE);
const peds = new Set(E.map((e) => String(e.safiro)));
const idx = R('kardex/indice.json');
const K = new Map();
for (const m of idx.meses) {
  const p = R('kardex/' + m.archivo);
  const o = p._meta.orden, dic = p.dic, pos = {}, isd = {};
  o.forEach((c, i) => { const k = c.replace('*', ''); pos[k] = i; isd[k] = c.endsWith('*'); });
  const g = (r, k) => { const v = r[pos[k]]; return (isd[k] && typeof v === 'number' && v >= 0 && v < (dic[k] || []).length) ? dic[k][v] : v; };
  for (const r of p.rows) {
    const mv = String(g(r, 'm')); if (mv !== '101' && mv !== '102') continue;
    const ped = String(g(r, 'ped')); if (!peds.has(ped)) continue;
    const key = ped + '|' + g(r, 'mat');
    if (!K.has(key)) K.set(key, []);
    K.get(key).push([mv, g(r, 'fd') || g(r, 'f'), g(r, 'f')]);
  }
}
const rows = E.map((e) => {
  const ks = K.get(e.safiro + '|' + e.mat) || [];
  let k = null;
  ks.filter((r) => r[0] === '101').forEach((r) => { const d = Math.abs(D(r[1]) - D(e.fRec)); if (!k || d < k.d) k = { f: r[2], d }; });
  return [
    'RB-' + e.oc + '-' + e.fRec.replace(/-/g, ''), String(e.oc), String(e.cod || ''), String(e.desc || '').slice(0, 70),
    e.prov || '', e.fRec, Number(e.cant) || 0, e.fSalmi || null, k ? String(k.f).slice(0, 10) : null, ks.some((r) => r[0] === '102') ? 1 : 0
  ];
});
const out = {
  _meta: {
    fuente: 'Informe de entradas de Abasto (recepción CEDIS Panamá) + kardex MB51 (SAP SAFIRO)',
    desde: DESDE, corteEntradas: ent._meta.corte, filas: rows.length,
    columnas: ['exp', 'oc', 'cod', 'desc', 'prov', 'fRec', 'cant', 'fSalmi', 'f101', 'rev102'],
    generado: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  },
  rows
};
const destino = path.join(__dirname, '..', 'seguimiento_entregas.json');
const previo = fs.existsSync(destino) ? JSON.parse(fs.readFileSync(destino, 'utf8')) : null;
if (previo && JSON.stringify(previo.rows) === JSON.stringify(rows)) { console.log('Sin cambios (' + rows.length + ' filas).'); process.exit(0); }
fs.writeFileSync(destino, JSON.stringify(out));
console.log('seguimiento_entregas.json: ' + rows.length + ' filas, ' + rows.filter((r) => r[8]).length + ' con entrada 101.');
