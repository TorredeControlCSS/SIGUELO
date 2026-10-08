/**
 * ============================================================================
 *  SEGUIMIENTO DE LA ENTREGA EN EL EXCEL DEL PROVEEDOR   (08-oct-2026)
 *  Diego Bethancourth · Torre de Control · DINALOG · CSS
 * ----------------------------------------------------------------------------
 *  Agrega al Excel "Trazabilidad de citas" del proveedor las mismas etapas
 *  que ve en solicitud_cita.html: recepción en el CEDIS, ingreso al
 *  inventario, entrada en SAP, revisión del informe, Contabilidad y
 *  publicación. Fuentes:
 *    - seguimiento_entregas.json (GitHub Pages: entradas de Abasto + kardex)
 *    - trzResumen_() del módulo TRAZABILIDAD_RB (si está instalado)
 *  Lo usa generarExcelProveedor. Si algo falla, el Excel sale igual, sin
 *  estas columnas llenas. Probar: excelSeguimientoProbar('NOMBRE EMPRESA')
 * ============================================================================
 */
var XSG_URL = 'https://torredecontrolcss.github.io/SIGUELO/seguimiento_entregas.json';
var XSG_HEADERS = ['Recibida en CEDIS', 'Cant. recibida', 'Ingreso inventario', 'Entrada SAP', 'Revisión del informe', 'Contabilidad', 'Publicación', 'Etapa actual'];

function xsgOC_(oc) {
  var s = String(oc || '');
  var m = s.replace(/\s+/g, '').match(/(?:^|\D)(100\d{7})(?!\d)/) || s.match(/(?:^|\D)(100\d{7})(?!\d)/);
  return m ? m[1] : '';
}
function xsgCod_(c) { return String(c || '').replace(/\.0+$/, '').replace(/[-\s]/g, ''); }
function xsgFecha_(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : ''; }

function xsgCargar_() {
  var idx = {};
  try {
    var r = UrlFetchApp.fetch(XSG_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    var j = JSON.parse(r.getContentText()), c = j._meta.columnas, ix = function (n) { return c.indexOf(n); };
    j.rows.forEach(function (row) {
      var k = String(row[ix('oc')]) + '|' + String(row[ix('cod')]);
      (idx[k] = idx[k] || []).push({ exp: row[ix('exp')], fRec: row[ix('fRec')], fSalmi: row[ix('fSalmi')], f101: row[ix('f101')], cant: row[ix('cant')] });
    });
  } catch (e) { Logger.log('xsgCargar_: ' + e); return null; }
  return idx;
}

/* Devuelve, para cada cita, las 8 columnas de seguimiento (vacías si no aplica). */
function excelSeguimiento_(citas) {
  var vacio = function () { return ['', '', '', '', '', '', '', '']; };
  var idx = xsgCargar_();
  if (!idx) return citas.map(vacio);
  var res = null;
  try { if (typeof trzResumen_ === 'function') { var t = trzResumen_(); if (t && t.success) res = t.expedientes || {}; } } catch (e) {}
  return citas.map(function (c) {
    var est = String(c.estado || '').toUpperCase();
    if (est !== 'ASISTIO' && est !== 'ENTREGADO') return vacio();
    var fc = String(c.fecha_confirmada || c.fecha_solicitada || '').slice(0, 10);
    var L = idx[xsgOC_(c.oc) + '|' + xsgCod_(c.cod_abasto)] || [];
    var best = null, t0 = fc ? new Date(fc + 'T12:00:00').getTime() : null;
    if (t0) L.forEach(function (e) { var d = Math.abs(new Date(e.fRec + 'T12:00:00').getTime() - t0); if (d <= 20 * 864e5 && (!best || d < best._d)) { best = e; best._d = d; } });
    if (!best) return ['Aún no aparece en el informe de recepción', '', '', '', '', '', '', 'Recepción'];
    var h = (res && res[best.exp] && res[best.exp].hitos) || {};
    var et = [
      ['Recibida en el CEDIS', best.fRec], ['Ingreso al inventario', best.fSalmi], ['Entrada en SAP', best.f101],
      ['Revisión del informe', h.P11], ['Contabilidad', h.C12], ['Publicación', h.P14]
    ];
    var ultimo = -1; et.forEach(function (x, i) { if (x[1]) ultimo = i; });
    var actual = ultimo + 1 < et.length ? et[ultimo + 1][0] : 'Contraloría y pago';
    var celda = function (i) { return et[i][1] ? xsgFecha_(et[i][1]) : (i < ultimo ? 'Sin fecha registrada' : (i <= 2 ? 'Pendiente' : (res ? 'Pendiente' : 'Sin registro digital'))); };
    return [celda(0), Number(best.cant) || 0, celda(1), celda(2), celda(3), celda(4), celda(5), actual];
  });
}

/* Desde el editor no se pueden pasar argumentos: sin empresa, prueba con
   el proveedor que más citas tiene en SOLICITUDES. */
function excelSeguimientoProbar(empresa) {
  empresa = String(empresa || '').trim();
  if (!empresa) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SOLICITUDES_SHEET_NAME);
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h || '').trim().toUpperCase(); });
    var iE = hdr.indexOf('EMPRESA'), cuenta = {};
    sh.getRange(2, iE + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { var e = String(r[0] || '').trim(); if (e) cuenta[e] = (cuenta[e] || 0) + 1; });
    empresa = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; })[0] || '';
  }
  var r = getCitasProveedor(empresa);
  var citas = (r && r.citas) || [];
  var s = excelSeguimiento_(citas);
  var n = 0;
  citas.forEach(function (c, i) { if (s[i][0]) { n++; if (n <= 10) Logger.log(c.oc + ' · ' + c.cod_abasto + ' → ' + JSON.stringify(s[i])); } });
  Logger.log('Proveedor: ' + empresa + ' · citas: ' + citas.length + ' · con seguimiento: ' + n);
}
