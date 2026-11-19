

/* ════════════════════════════════════════════════════════════════════════════
 *  ENTREGAS DIRECTAS EN UNIDADES EJECUTORAS · 19-nov-2026
 *  ----------------------------------------------------------------------------
 *  Las solicitudes de entrega ya no van solo a los CEDIS: parte se entrega directo
 *  en las Unidades Ejecutoras (p. ej. PANSALUD, solicitud 1717, 9 hospitales).
 *  Este bloque registra esas entregas y las suma al tránsito:
 *    · Hoja TRANSITOS_ENTREGAS_UE: una fila por Unidad Ejecutora y entrega, con su
 *      fuente (PLANIFICADOR o SEGUIMIENTO), respaldo y quién la registró. Nunca se
 *      borra: una línea se anula con ESTADO = ANULADO.
 *    · tueRegistrar (acción registrarEntregaUE del panel de Tránsitos): el
 *      planificador registra una o varias Unidades Ejecutoras con su respaldo.
 *    · tueDesdeSeguimiento_ (al publicar el libro de Incumplimientos): las sub-notas
 *      con destino a una Unidad Ejecutora y recibido completo se registran solas,
 *      igual que las recepciones de los CEDIS (decidido 19-nov-2026).
 *    · El total entregado = lo ya confirmado + lo nuevo, sin pasar la cantidad de la
 *      solicitud. Se escribe con tevEscribirConfirmaciones_ (nunca baja lo registrado,
 *      queda en TEV_RESPUESTAS) y se publica transitos_entregas_ue.json.
 *  Para probar desde el editor: tuePublicarAhora(), tueSeguimientoAhora().
 * ════════════════════════════════════════════════════════════════════════════ */
var TUE = {
  HOJA: 'TRANSITOS_ENTREGAS_UE',
  COLS: ['ID_LINEA', 'TS', 'ID_TRANSITO', 'N_DOCUMENTO', 'OC', 'COD', 'UE', 'FECHA_RECEPCION', 'CANTIDAD', 'INFORME',
         'FUENTE', 'NOTA_SEGUIMIENTO', 'RESPALDO_URL', 'OBS', 'REGISTRO_POR', 'ESTADO', 'CLAVE'],
  GH_PATH: 'transitos_entregas_ue.json',
  CARPETA: 'Respaldos_Entregas_UE',
  SEG_URL: 'https://raw.githubusercontent.com/TorredeControlCSS/seguire/main/data/cumplimiento_entregas.json',
  SALDOS_URL: 'https://raw.githubusercontent.com/TorredeControlCSS/SIGUELO/main/saldos_en_linea.json',
  CEDIS: { CDPA: 1, CDDI: 1, CDCH: 1 }
};

function tueHoja_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(TUE.HOJA);
  if (!sh) {
    sh = ss.insertSheet(TUE.HOJA);
    sh.getRange(1, 1, 1, TUE.COLS.length).setValues([TUE.COLS]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#0C447C');
    sh.setFrozenRows(1);
  }
  return sh;
}
function tueLeer_() {
  var sh = tueHoja_(); if (sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), h = v[0].map(function (x) { return String(x).trim().toUpperCase(); });
  return v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
}
function tueFecha_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'America/Panama', 'yyyy-MM-dd');
  var s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
function tueOc10_(v) { var m = /10\d{8}/.exec(String(v || '').replace(/\s+/g, '')); return m ? m[0] : ''; }
function tueNotaBase_(v) { var m = /(\d{3,5})\s*-\s*20\d{2}/.exec(String(v || '')); return m ? String(Number(m[1])) : ''; }

/* Transitos de la hoja, por ID: lo justo para registrar y cruzar. */
function tueTransitos_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TR_OC_SHEET), idx = tr_colIndex_(sh), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var g = function (r, k) { return idx[k] != null ? r[idx[k]] : ''; };
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(function (r) {
    var id = String(g(r, 'ID') || '').trim(); if (!id) return;
    out[id] = { id: id, doc: String(g(r, 'N_DOCUMENTO') || ''), oc: String(g(r, 'N_ORDEN_COMPRA') || ''), cod: normalizarCodigo_(g(r, 'COD_ABASTO')),
      tipo: String(g(r, 'TIPO') || '').toUpperCase(), cant: tevNum_(g(r, 'CANTIDAD')) || 0, ent: tevNum_(g(r, 'CANT_ENTREGADA')) || 0 };
  });
  return out;
}

/* Agrega líneas y sube el entregado de cada tránsito. lineas: [{t, ue, fecha, cant, informe, fuente, nota, respaldo, obs, por, clave}] */
function tueAplicar_(lineas, porTxt) {
  if (!lineas.length) return { lineas: 0, confirmados: 0 };
  var sh = tueHoja_(), ahora = new Date(), filas = [], suma = {};
  lineas.forEach(function (l, i) {
    filas.push(['UE-' + ahora.getTime() + '-' + i, ahora, l.t.id, l.t.doc, l.t.oc, l.t.cod, l.ue, l.fecha, l.cant, l.informe || '', l.fuente,
                l.nota || '', l.respaldo || '', l.obs || '', l.por || '', 'VIGENTE', l.clave || '']);
    var s = suma[l.t.id] = suma[l.t.id] || { t: l.t, q: 0, f: '', fuentes: {} }; s.q += l.cant; if (l.fecha > s.f) s.f = l.fecha; s.fuentes[l.fuente] = 1;
  });
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, TUE.COLS.length).setValues(filas);
  var lista = Object.keys(suma).map(function (id) { var s = suma[id];
    return { id: id, cod: s.t.cod, _n: lineas.filter(function (l) { return l.t.id === id; }).length, _f: Object.keys(s.fuentes).join('+'),
             evidencia: { recibido: Math.min(s.t.cant, s.t.ent + s.q), nivel: 'ENTREGA_UE', ultimaEntrada: s.f } }; });
  var r = tevEscribirConfirmaciones_(lista, { por: function (x) { return porTxt(x); } });
  return { lineas: filas.length, confirmados: (r && r.confirmados) || 0 };
}

/* Acción del panel: registrarEntregaUE. d = {id, lineas:[{ue, fecha, cant, informe}], obs, por, respaldo:{base64, mime, nombre}} */
function tueRegistrar(d) {
  try {
    d = d || {};
    var T = tueTransitos_(), t = T[String(d.id || '')];
    if (!t) return { success: false, error: 'No se encontró el tránsito.' };
    if (t.tipo === 'ORDEN_COMPRA') return { success: false, error: 'Las entregas se registran en la Solicitud de Entrega, no en la OC madre.' };
    var L = (d.lineas || []).map(function (x) { return { ue: String(x.ue || '').trim(), fecha: String(x.fecha || '').slice(0, 10), cant: Math.round(Number(x.cant) || 0), informe: String(x.informe || '').trim() }; })
      .filter(function (x) { return x.ue || x.cant; });
    if (!L.length) return { success: false, error: 'Agregue al menos una Unidad Ejecutora.' };
    for (var i = 0; i < L.length; i++) {
      if (!L[i].ue) return { success: false, error: 'Falta la Unidad Ejecutora en la línea ' + (i + 1) + '.' };
      if (!(L[i].cant > 0)) return { success: false, error: 'Falta la cantidad en la línea ' + (i + 1) + '.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(L[i].fecha)) return { success: false, error: 'Falta la fecha de recepción en la línea ' + (i + 1) + '.' };
    }
    var q = L.reduce(function (s, x) { return s + x.cant; }, 0);
    if (t.ent + q > t.cant + 0.5) return { success: false, error: 'La suma (' + (t.ent + q) + ') pasa la cantidad de la solicitud (' + t.cant + '). Ya hay ' + t.ent + ' entregadas.' };
    if (!d.respaldo || !d.respaldo.base64) return { success: false, error: 'Adjunte el respaldo de la entrega (gestión de cobro, informes de recepción o nota del proveedor).' };
    var it = DriveApp.getFoldersByName(TUE.CARPETA), carp = it.hasNext() ? it.next() : DriveApp.createFolder(TUE.CARPETA);
    var f = carp.createFile(Utilities.newBlob(Utilities.base64Decode(String(d.respaldo.base64)), d.respaldo.mime || 'application/pdf',
      (t.doc + '_' + (d.respaldo.nombre || 'respaldo')).replace(/[\\\/:*?"<>|]+/g, '_')));
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (eS) {}
    var por = String(d.por || '').trim() || 'planificador';
    var lineas = L.map(function (x) { return { t: t, ue: x.ue, fecha: x.fecha, cant: x.cant, informe: x.informe, fuente: 'PLANIFICADOR', respaldo: f.getUrl(), obs: String(d.obs || '').slice(0, 500), por: por,
      clave: 'PLN|' + t.id + '|' + x.ue + '|' + (x.informe || x.fecha) }; });
    var r = tueAplicar_(lineas, function (x) { return 'Planificador ' + por + ' · entrega directa en ' + x._n + ' Unidad' + (x._n > 1 ? 'es' : '') + ' Ejecutora' + (x._n > 1 ? 's' : ''); });
    var entregado = Math.min(t.cant, t.ent + q);
    try { tuePublicar_(); } catch (eP) { Logger.log('tuePublicar_: ' + eP); }
    try { trnPublicar_(true); } catch (eT) { Logger.log('trnPublicar_: ' + eT); }
    return { success: true, lineas: r.lineas, cant_entregada: entregado, saldo: Math.max(0, t.cant - entregado) };
  } catch (e) { return { success: false, error: String(e && e.message || e) }; }
}

/* Libro de Incumplimientos (objeto publicado): sub-notas con destino a una Unidad
   Ejecutora y recibido completo → entrega directa, una sola vez por sub-nota. */
function tueDesdeSeguimiento_(obj) {
  if (!obj || !obj.cols || !obj.rows) return { lineas: 0 };
  var ci = {}; obj.cols.forEach(function (c, i) { ci[c] = i; });
  var T = tueTransitos_(), porClave = {};
  Object.keys(T).forEach(function (id) { var t = T[id]; if (t.tipo === 'ORDEN_COMPRA') return;
    var k = tueOc10_(t.oc) + '|' + t.cod + '|' + tueNotaBase_(t.doc); if (tueOc10_(t.oc) && tueNotaBase_(t.doc)) (porClave[k] = porClave[k] || []).push(t); });
  var ya = {}; tueLeer_().forEach(function (x) { if (x.CLAVE) ya[String(x.CLAVE)] = 1; });
  var lineas = [], libre = {};
  obj.rows.forEach(function (r) {
    var ced = String(r[ci.cedis] == null ? '' : r[ci.cedis]).trim().toUpperCase();
    if (!ced || TUE.CEDIS[ced]) return;
    var qty = Number(r[ci.qty]) || 0, rec = Number(r[ci.recib]) || 0;
    if (!(qty > 0) || rec < qty) return;                                          // solo recibido completo
    var nota = String(r[ci.nota] || ''), base = String(Number(String(nota).split('.')[0]) || '');
    var clave = 'SEG|' + String(r[ci.req]) + '|' + nota;
    if (ya[clave]) return;
    var L = porClave[tueOc10_(r[ci.req]) + '|' + normalizarCodigo_(r[ci.cod]) + '|' + base]; if (!L || L.length !== 1) return;   // un solo tránsito, sin ambigüedad
    var t = L[0], disp = (libre[t.id] != null ? libre[t.id] : t.cant - t.ent);
    if (rec > disp + 0.5) return;                                                // ya estaba contado por otra fuente
    libre[t.id] = disp - rec;
    lineas.push({ t: t, ue: ced, fecha: tueFecha_(r[ci.ult]) || tueFecha_(r[ci.venc]), cant: rec, informe: '', fuente: 'SEGUIMIENTO', nota: nota,
      obs: 'Libro de Incumplimientos de Seguimiento: sub-nota ' + nota + ' recibida completa', por: 'Torre de Control · automático (Seguimiento)', clave: clave });
  });
  var res = tueAplicar_(lineas, function (x) { return TEV.AUTO_POR + ' (libro de Seguimiento · ' + x._n + ' Unidad' + (x._n > 1 ? 'es' : '') + ' Ejecutora' + (x._n > 1 ? 's' : '') + ')'; });
  if (res.lineas) { try { trnPublicar_(true); } catch (eT) { Logger.log('trnPublicar_: ' + eT); } }
  try { tuePublicar_(obj); } catch (eP) { Logger.log('tuePublicar_: ' + eP); }
  return res;
}

/* transitos_entregas_ue.json: líneas vigentes, precarga de Seguimiento por tránsito y catálogo de Unidades Ejecutoras. */
function tuePublicar_(segObj) {
  var props = PropertiesService.getScriptProperties(), token = props.getProperty('GH_TOKEN');
  if (!token) return { success: false, error: 'Falta GH_TOKEN.' };
  var lin = tueLeer_().filter(function (x) { return String(x.ESTADO).toUpperCase() !== 'ANULADO'; }).map(function (x) {
    return [String(x.ID_TRANSITO), String(x.UE), tueFecha_(x.FECHA_RECEPCION), Number(x.CANTIDAD) || 0, String(x.INFORME || ''), String(x.FUENTE || ''), String(x.NOTA_SEGUIMIENTO || ''),
            String(x.RESPALDO_URL || ''), String(x.REGISTRO_POR || ''), tueFecha_(x.TS)]; });
  var pre = {};
  try {
    var S = segObj || JSON.parse(UrlFetchApp.fetch(TUE.SEG_URL + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText());
    var ci = {}; S.cols.forEach(function (c, i) { ci[c] = i; });
    var T = tueTransitos_(), porClave = {};
    Object.keys(T).forEach(function (id) { var t = T[id]; var k = tueOc10_(t.oc) + '|' + t.cod + '|' + tueNotaBase_(t.doc); if (tueOc10_(t.oc) && tueNotaBase_(t.doc) && t.tipo !== 'ORDEN_COMPRA') (porClave[k] = porClave[k] || []).push(id); });
    S.rows.forEach(function (r) {
      var ced = String(r[ci.cedis] == null ? '' : r[ci.cedis]).trim().toUpperCase(); if (!ced || TUE.CEDIS[ced]) return;
      var base = String(Number(String(r[ci.nota] || '').split('.')[0]) || '');
      var L = porClave[tueOc10_(r[ci.req]) + '|' + normalizarCodigo_(r[ci.cod]) + '|' + base]; if (!L || L.length !== 1) return;
      (pre[L[0]] = pre[L[0]] || []).push([ced, Number(r[ci.qty]) || 0, Number(r[ci.recib]) || 0, String(r[ci.nota] || ''), tueFecha_(r[ci.ult])]);
    });
  } catch (eS) { Logger.log('tuePublicar_ · Seguimiento: ' + eS); }
  var ues = [];
  try {
    var cache = CacheService.getScriptCache(), c = cache.get('TUE_UES');
    if (c) ues = JSON.parse(c);
    else {
      var SAL = JSON.parse(UrlFetchApp.fetch(TUE.SALDOS_URL + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText()), vis = {};
      Object.keys(SAL.renglones || {}).forEach(function (k) { (SAL.renglones[k].puntos || []).forEach(function (p) {
        var n = String(p.punto_canon || p.punto || '').trim(); if (n && !p.es_cedis && !/^CEDIS/i.test(n)) vis[n] = 1; }); });
      ues = Object.keys(vis).sort(); cache.put('TUE_UES', JSON.stringify(ues), 21600);
    }
  } catch (eU) { Logger.log('tuePublicar_ · catálogo UE: ' + eU); }
  var obj = { _meta: { fuente: 'TRANSITOS_ENTREGAS_UE (planificadores y libro de Seguimiento)', generado: Utilities.formatDate(new Date(), 'America/Panama', 'yyyy-MM-dd HH:mm') + ' PTY',
    columnas: ['idTransito', 'ue', 'fecha', 'cantidad', 'informe', 'fuente', 'notaSeguimiento', 'respaldo', 'registro', 'registrado'],
    columnasPrecarga: ['ue', 'solicitado', 'recibido', 'nota', 'ultimaEntrada'], lineas: lin.length }, rows: lin, precarga: pre, ues: ues };
  var api = 'https://api.github.com/repos/' + SALDOS_GH_OWNER + '/' + SALDOS_GH_REPO + '/contents/' + TUE.GH_PATH;
  var hd = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, sha = null;
  try { var g = UrlFetchApp.fetch(api + '?ref=' + SALDOS_GH_BRANCH, { method: 'get', headers: hd, muteHttpExceptions: true }); if (g.getResponseCode() === 200) sha = JSON.parse(g.getContentText()).sha; } catch (e0) {}
  var body = { message: 'Actualizar ' + TUE.GH_PATH + ' (' + obj._meta.generado + ')', content: Utilities.base64Encode(JSON.stringify(obj), Utilities.Charset.UTF_8), branch: SALDOS_GH_BRANCH };
  if (sha) body.sha = sha;
  var p = UrlFetchApp.fetch(api, { method: 'put', headers: hd, contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  return (p.getResponseCode() === 200 || p.getResponseCode() === 201) ? { success: true, lineas: lin.length, precarga: Object.keys(pre).length, ues: ues.length }
    : { success: false, error: 'GitHub respondió ' + p.getResponseCode() };
}

/* Para el editor */
function tuePublicarAhora() { var r = tuePublicar_(); Logger.log(JSON.stringify(r)); return r; }
function tueSeguimientoAhora() {
  var S = JSON.parse(UrlFetchApp.fetch(TUE.SEG_URL + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText());
  var r = tueDesdeSeguimiento_(S); Logger.log('Entregas en Unidades Ejecutoras desde Seguimiento: ' + JSON.stringify(r)); return r;
}
