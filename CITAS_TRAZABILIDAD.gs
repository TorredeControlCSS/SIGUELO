/**
 * ============================================================================
 *  CITAS PARA TRAZABILIDAD → citas_trazabilidad.json   (08-oct-2026)
 *  Diego Bethancourth · Torre de Control · DINALOG · CSS
 * ----------------------------------------------------------------------------
 *  Por qué existe: citas_proveedores.json publica solo las citas activas y las
 *  de los últimos 30 días (para Yarvis). Para cruzar cada recepción con su
 *  cita hace falta el historial completo y la OC normalizada: hoy los
 *  proveedores escriben la OC con 08-12, letras, el pedido SAFIRO pegado o un
 *  sufijo de entrega (-a, -2, #2, N1). Con la OC normalizada el cruce
 *  recepción ↔ cita pasa de 124 a ~820 de 956 líneas (13 % → 86 %).
 *
 *  SOLO LEE la hoja SOLICITUDES. No cambia la OC que escribió el proveedor:
 *  publica al lado su forma normalizada (ocBase), el N.º de entrega detectado
 *  y el tipo de dato (OC, SOLICITUD_ENTREGA, SOLO_SAFIRO, ADELANTO, NO_RECONOCIDA).
 *
 *  Publica en el mismo repo/rama que citas_proveedores.json, solo si cambió
 *  (huella MD5). Se engancha en citasDiferido_ (cada 15 min con los saldos).
 *  Probar: citasTrazPublicarAhora()   ·   Revisar normalización: citasTrazProbarNormalizacion()
 * ============================================================================
 */
var CTZ_GH_PATH = 'citas_trazabilidad.json';
var CTZ_PROP_HASH = 'CTZ_HUELLA';
var CTZ_DESDE = '2026-01-01';

/* Normaliza lo que el proveedor escribió en el campo OC. Misma regla que la
   auditoría del 08-oct y que la validación nueva de solicitud_cita.html. */
function ctzNormalizarOC_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  var up = s.toUpperCase();
  var o = { ocBase: '', entrega: '', safiro: '', tipo: '' };
  var sf = s.replace(/\s+/g, '').match(/3000\d{6}/);
  if (sf) o.safiro = sf[0];
  if (up.indexOf('ADELANTO') >= 0) { o.tipo = 'ADELANTO'; return o; }
  if (/DINALOG|S\.\s*MED|P\.\s*DE/.test(up) || /^\d{3,4}\s*-\s*20\d\d$/.test(s)) {
    var n = s.match(/(\d{3,4})\s*-\s*(20\d\d)/);
    o.tipo = 'SOLICITUD_ENTREGA'; o.ocBase = n ? (n[1] + '-' + n[2]) : '';
    return o;
  }
  var compacto = s.replace(/\s+/g, '');
  var toks = compacto.match(/\d+/g) || [];
  var hayOC = toks.some(function (t) { return /^100\d{7}$/.test(t); });
  var largos = toks.some(function (t) { return t.length >= 11; });
  if (!hayOC && !largos) {
    var saf = toks.filter(function (t) { return /^3000\d{6}$/.test(t); });
    if (saf.length) { o.tipo = 'SOLO_SAFIRO'; o.safiro = saf[0]; return o; }
  }
  var d = s.indexOf('3000') === 0 ? String(s.split('/').pop()).replace(/\D/g, '') : String(s.split('/')[0]).replace(/\D/g, '');
  var m = compacto.match(/(?:^|\D)(100\d{7})(?!\d)/) || s.match(/(?:^|\D)(100\d{7})(?!\d)/);
  if (d.length === 24) { o.ocBase = d.slice(0, 10); o.safiro = d.slice(14); o.tipo = 'OC'; return o; }
  if (d.length === 14 && d.slice(10) === '0812') { o.ocBase = d.slice(0, 10); o.tipo = 'OC'; }
  else if (m) { o.ocBase = m[1]; o.tipo = 'OC'; }
  else if (d.length === 11 && d.indexOf('100') === 0) { o.ocBase = d.slice(0, 10); o.entrega = d.charAt(10); o.tipo = 'OC'; return o; }
  else if (/^100\d{6}$/.test(d)) { o.tipo = 'OC_INCOMPLETA'; o.ocBase = d; return o; }
  else { o.tipo = 'NO_RECONOCIDA'; return o; }
  // Número de entrega: nuevo formato OC-E2, o los sufijos que escribían a mano.
  var pos = compacto.indexOf(o.ocBase);
  var resto = pos >= 0 ? compacto.slice(pos + 10) : '';
  var e2 = s.match(/-E(\d{1,2})\s*$/i);
  if (e2) { o.entrega = e2[1]; return o; }
  resto = resto.replace(/^\s*[-\s]?0?8[-\s]?12/, '').replace(/3000\d{6}/g, '').replace(/D\.?\s*G\.?/ig, '').trim();
  var mm2 = resto.match(/(\d)\s*-\s*(\d)\s*$/);
  var mm = resto.match(/(?:#|N[oº°]?\.?\s*|-\s*|\s)([0-9]{1,2}|[A-Za-z])\s*$/);
  if (mm2) o.entrega = mm2[2]; else if (mm) o.entrega = mm[1].toLowerCase();
  return o;
}

function ctzConstruir_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SOLICITUDES');
  if (!sh || sh.getLastRow() < 2) return { _meta: { fuente: 'SOLICITUDES', filas: 0 }, rows: [] };
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h || '').trim().toUpperCase(); });
  var c = function (n) { return head.indexOf(n); };
  var tz = 'America/Panama';
  var iso = function (v) {
    if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    var s = String(v || '').trim(), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
  };
  var I = { id: c('ID_SOLICITUD'), marca: c('MARCA_TEMPORAL'), emp: c('EMPRESA'), oc: c('OC'), cod: c('COD_ABASTO'), des: c('DESCRIPCION'),
            uni: c('CANT_UNIDADES'), ent: c('CANT_ENTREGADA'), fs: c('FECHA_SOLICITADA'), fc: c('FECHA_CONFIRMADA'), est: c('ESTADO') };
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues(), out = [];
  v.forEach(function (r) {
    var est = String(r[I.est] || '').trim().toUpperCase(); if (!est) return;
    var fs = iso(r[I.fs]), fc = I.fc >= 0 ? iso(r[I.fc]) : '';
    var ref = fc || fs; if (!ref || ref < CTZ_DESDE) return;
    var n = ctzNormalizarOC_(r[I.oc]);
    out.push([
      String(r[I.id] || ''),
      r[I.marca] instanceof Date ? Utilities.formatDate(r[I.marca], tz, 'yyyy-MM-dd HH:mm') : String(r[I.marca] || '').slice(0, 16),
      String(r[I.emp] || '').trim(),
      n.ocBase,
      String(r[I.cod] || '').replace(/[-\s]/g, '').replace(/\.0$/, ''),
      fs, fc, est,
      String(r[I.oc] || '').trim(),
      n.entrega, n.tipo, n.safiro,
      Number(r[I.uni]) || 0,
      I.ent >= 0 ? (Number(r[I.ent]) || 0) : 0,
      String(r[I.des] || '').slice(0, 90)
    ]);
  });
  return { _meta: { fuente: 'SOLICITUDES (historial desde ' + CTZ_DESDE + ', OC normalizada)', filas: out.length,
    columnas: ['id', 'solicitadaEl', 'proveedor', 'ocBase', 'codigo', 'fechaSolicitada', 'fechaConfirmada', 'estado',
               'ocEscrita', 'entrega', 'tipoOC', 'safiro', 'unidades', 'entregadas', 'descripcion'] }, rows: out };
}

function ctzPublicar_(forzar) {
  var props = PropertiesService.getScriptProperties(), token = props.getProperty('GH_TOKEN');
  if (!token) return { success: false, error: 'Falta GH_TOKEN en las propiedades del script de SÍGUELO.' };
  var obj = ctzConstruir_(), cuerpo = JSON.stringify(obj.rows);
  var huella = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cuerpo, Utilities.Charset.UTF_8));
  if (!forzar && props.getProperty(CTZ_PROP_HASH) === huella) return { success: true, sinCambios: true, filas: obj._meta.filas };
  obj._meta.generado = Utilities.formatDate(new Date(), 'America/Panama', 'yyyy-MM-dd HH:mm') + ' PTY';
  var contenido = JSON.stringify(obj);
  var apiBase = 'https://api.github.com/repos/' + SALDOS_GH_OWNER + '/' + SALDOS_GH_REPO + '/contents/' + CTZ_GH_PATH;
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, sha = null;
  try {
    var g = UrlFetchApp.fetch(apiBase + '?ref=' + SALDOS_GH_BRANCH, { method: 'get', headers: headers, muteHttpExceptions: true });
    if (g.getResponseCode() === 200) sha = JSON.parse(g.getContentText()).sha;
  } catch (e) {}
  var payload = { message: 'Actualizar citas_trazabilidad.json (' + obj._meta.generado + ')', content: Utilities.base64Encode(contenido, Utilities.Charset.UTF_8), branch: SALDOS_GH_BRANCH };
  if (sha) payload.sha = sha;
  var p = UrlFetchApp.fetch(apiBase, { method: 'put', headers: headers, contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (p.getResponseCode() === 200 || p.getResponseCode() === 201) { props.setProperty(CTZ_PROP_HASH, huella); return { success: true, filas: obj._meta.filas, generado: obj._meta.generado }; }
  return { success: false, error: 'GitHub respondió ' + p.getResponseCode() + ': ' + p.getContentText().slice(0, 300) };
}

/* Lo llama citasDiferido_. Nunca lanza. */
function citasTrazDiferido_() {
  // También publica la bitácora de hitos documentales (TRAZABILIDAD_RB.gs).
  try { if (typeof trzDiferido_ === 'function') trzDiferido_(); } catch (eT) {}
  // Copia rápida de panel_confirmacion (PANEL_ADMIN.gs): solo trabaja si SIGUELO cambió.
  try { if (typeof panelDiferido_ === 'function') panelDiferido_(); } catch (eP) {}
  try {
    var r = ctzPublicar_(false);
    if (r && r.success && !r.sinCambios) Logger.log('citas_trazabilidad.json publicado: ' + r.filas + ' filas.');
    if (r && !r.success) Logger.log('citasTrazDiferido_: ' + r.error);
  } catch (e) { Logger.log('citasTrazDiferido_ ERROR: ' + e); }
}

/* Ejecutar desde el editor para la primera publicación. */
function citasTrazPublicarAhora() {
  var r = ctzPublicar_(true);
  Logger.log(r.success ? ('citas_trazabilidad.json publicado: ' + r.filas + ' filas · ' + r.generado) : ('No publicado: ' + r.error));
  return r;
}

/* Muestra en el registro cómo queda cada forma de OC que existe en la hoja. */
function citasTrazProbarNormalizacion() {
  var casos = ['1001106005', '1001106005-08-12', '1001106005-08-12-a', '10010266800812', '1001106005-E3',
    '1001105891-08-12 / 3000511799', ' 1001104677 N1', '3000511218', '100110627', 'DINALOG-P. de S. MED. N° 1565-2026', 'ADELANTO-DINALOG-N°691-05-2026'];
  casos.forEach(function (k) { Logger.log(JSON.stringify(k) + ' → ' + JSON.stringify(ctzNormalizarOC_(k))); });
  var obj = ctzConstruir_(), t = {};
  obj.rows.forEach(function (r) { t[r[10]] = (t[r[10]] || 0) + 1; });
  Logger.log('Filas desde ' + CTZ_DESDE + ': ' + obj.rows.length + ' · por tipo: ' + JSON.stringify(t));
}
