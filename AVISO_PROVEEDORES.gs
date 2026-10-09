/**
 * ============================================================================
 *  AVISO_PROVEEDORES · Cobertura semanal de los renglones de cada proveedor
 *  Diego Bethancourth · Torre de Control · DINALOG · CSS
 *  Proyecto: SIGUELO Backend (libro BASE DE DATOS DE CITAS)
 * ----------------------------------------------------------------------------
 *  Cuarta familia de correos (no se mezcla con Desabasto, Traslados entre CEDIS
 *  ni Aviso de Reposición a las UE). A cada proveedor, una vez por semana:
 *  "Los renglones que usted abastece tienen estas coberturas en CEDIS Panamá,
 *  Chiriquí y Divisa y en la red de unidades ejecutoras", con su saldo pendiente
 *  por entregar y el enlace a solicitud_cita. Copia al planificador de sus OC;
 *  si no hay planificador identificado, a la Jefatura de Planificación.
 *
 *  QUÉ RENGLONES: los del maestro de proveedores que siguen VIGENTES para ese
 *  proveedor: tiene OC o solicitud de entrega en tránsito, o entregó en los
 *  últimos 183 días (informe de entradas o cita asistida). Los que ya entrega
 *  otro proveedor, los que nunca entregó y los proveedores sin entregas no van.
 *
 *  DATOS (todo de GitHub Pages, lo mismo que ven los tableros):
 *    maestro_renglones.json · entradas_recepcion.json · citas_trazabilidad.json
 *    transitos_oc.json · saldos_en_linea.json (saldo y cobertura por punto)
 *
 *  HOJAS que crea solas:
 *    DIRECTORIO_PROVEEDORES   PROVEEDOR | CORREO_1 | CORREO_2 | CORREO_3 | DIA | ACTIVO | NOTA
 *        se llena con los correos que cada proveedor usó al pedir cita (SOLICITUDES);
 *        lo que usted edite a mano se respeta. DIA = 1 (lunes) … 5 (viernes).
 *    DIRECTORIO_PLANIFICADORES NOMBRE | CORREO | ACTIVO
 *        nombres tal como vienen en tránsitos; usted completa el CORREO.
 *        La fila "JEFATURA DE PLANIFICACIÓN" recibe la copia de los proveedores
 *        sin planificador identificado.
 *    AVP_BITACORA             cada envío (o simulación) con destinatarios y resultado.
 *
 *  ENVÍO: cuenta Brevo PROPIA de esta familia (no gasta la cuota de los avisos a
 *  las UE). Propiedades del script:
 *    AVP_BREVO_KEY     clave API de la segunda cuenta Brevo
 *    AVP_REMITENTE     correo verificado en esa cuenta (p. ej. info@torrecontrol.org)
 *    AVP_MODO          PRUEBA (por defecto) | REAL
 *    AVP_CORREO_PRUEBA a dónde van los correos en modo PRUEBA (por defecto, la
 *                      cuenta que corre el script)
 *    AVP_CUOTA         destinatarios máximos por día (por defecto 280)
 *  En PRUEBA nada sale a proveedores: cada aviso llega a AVP_CORREO_PRUEBA con
 *  una franja que dice a quién habría ido.
 *
 *  INSTALACIÓN:
 *    1) Pegar este archivo (nuevo) en el proyecto.
 *    2) Ejecutar avpInstalar(): crea las hojas, llena los directorios y crea el
 *       disparador de lunes a viernes a las 7 a. m.
 *    3) Completar correos en DIRECTORIO_PLANIFICADORES (y la Jefatura).
 *    4) Ejecutar avpProbar() → manda a AVP_CORREO_PRUEBA el aviso de un proveedor.
 *    5) Con la cuenta Brevo lista y revisado el directorio: AVP_MODO = REAL.
 *  También se maneja desde panel_confirmacion › Administración.
 *
 *  REVERSIÓN: avpDesinstalar() quita el disparador; borrar este archivo.
 * ============================================================================
 */

var AVP_BASE = 'https://torredecontrolcss.github.io/SIGUELO/';
var AVP_HOJA_DIR = 'DIRECTORIO_PROVEEDORES';
var AVP_HOJA_PLAN = 'DIRECTORIO_PLANIFICADORES';
var AVP_HOJA_BIT = 'AVP_BITACORA';
var AVP_JEFATURA = 'JEFATURA DE PLANIFICACIÓN';
var AVP_DIAS_VIGENCIA = 183;
var AVP_MAX_FILAS = 60;           // renglones por correo; el resto se ve en solicitud_cita
var AVP_DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

/* Pies oficiales (texto de la Jefatura, P-240 rev. 7.0). El proveedor recibe su versión;
   Planificación recibe una copia interna aparte, con su propio pie. */
var AVP_PIE_PROV = 'Aviso. Este mensaje es generado por la Torre de Control de Operaciones Logísticas de la Dirección Nacional de Logística, en aplicación del Procedimiento P‑240 (revisión 7.0), que faculta a esta Dirección a establecer las normas de planificación y control de existencias y a publicar por medio tecnológico el estado de las existencias y los indicadores logísticos de los renglones adquiridos por la institución (medidas 3, 24 y 26). Su finalidad es informarle el nivel de existencias, el alcance y los saldos pendientes de entrega de sus renglones, para que programe su capacidad de suministro y nos indique fechas estimadas de disponibilidad. No constituye Orden de Solicitud de Entrega, orden de compra ni modificación de contrato; las entregas se requieren únicamente mediante el formulario de Orden de Solicitud de Entrega o la orden de compra correspondiente (P‑240, glosario 10 y VII.C.1.4), y las citas de recepción se asignan por el mecanismo de citas del CEDIS. La información proviene de los sistemas institucionales a la fecha de corte indicada y puede variar.';
var AVP_PIE_PLAN = 'Aviso. Conforme al Procedimiento P‑240 (revisión 7.0), los almacenes reportan semanalmente las existencias físicas al Departamento de Planeación de Suministros (medida 27) y comunican a la Dirección las situaciones no frecuentes de demanda (medida 31); corresponde al planificador de inventarios confrontar el nivel de existencia con el punto de reorden y los niveles máximo, mínimo y de seguridad, y elaborar la Proforma de Pedido cuando corresponda (medida 18), considerando los pedidos en trámite, los pedidos en manos del proveedor y las órdenes o contratos pendientes de entrega (glosario 5). Este reporte de la Torre de Control se emite para ese fin: al recibirlo, el planificador debe verificar el saldo contra el sistema, requerir al proveedor la programación estimada de sus entregas y dejar constancia de la gestión en el expediente del renglón. No sustituye la Lista Semanal de Existencias ni la Proforma de Pedido, que siguen siendo los instrumentos oficiales del procedimiento.';

/* ------------------------------------------------------------------ */
/*  Utilidades                                                          */
/* ------------------------------------------------------------------ */

function avpProps_() { return PropertiesService.getScriptProperties(); }
function avpNorm_(s) {
  s = String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/\(.*?\)/g, ' ').replace(/[^A-Z0-9 ]/g, ' ');
  s = s.replace(/\b(S ?A|SAS|INC|CORP|Y CIA|CIA|DE|PANAMA|LTDA)\b/g, ' ');
  return s.replace(/\s+/g, '');
}
function avpCod_(c) { return String(c == null ? '' : c).replace(/\.0+$/, '').replace(/[-\s]/g, '').trim(); }
function avpJson_(archivo) {
  var r = UrlFetchApp.fetch(AVP_BASE + archivo + '?_=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('No se pudo leer ' + archivo + ' (' + r.getResponseCode() + ').');
  return JSON.parse(r.getContentText());
}
function avpHoja_(nombre, enc) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(nombre);
  if (!sh) { sh = ss.insertSheet(nombre); sh.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function avpIdx_(fila) { var m = {}; fila.forEach(function (h, i) { m[String(h || '').trim().toUpperCase()] = i; }); return m; }
function avpCorreoOk_(c) { return /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(String(c || '').trim()); }
function avpHoy_() { return Utilities.formatDate(new Date(), 'America/Panama', 'yyyy-MM-dd'); }
function avpEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function avpFmt_(n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ------------------------------------------------------------------ */
/*  Alias de proveedor: la misma matriz que usan los demás tableros     */
/* ------------------------------------------------------------------ */
/* Devuelve una función nombre → nombre del maestro ('' si no lo reconoce).
   1) igualdad normalizada contra el maestro; 2) la matriz MAESTRO_ALIAS_PROVEEDOR
   del libro; 3) los alias que publica entradas_recepcion.json (aliasProveedor),
   que salen de esa misma matriz. Una escritura nueva se agrega en la hoja de
   alias, no aquí. */
function avpAlias_(maestroNombres, entMeta) {
  var canon = {}, map = {};
  maestroNombres.forEach(function (p) { canon[avpNorm_(p)] = p; });
  var add = function (raw, can) { var c = canon[avpNorm_(can)]; var k = avpNorm_(raw); if (c && k && !map[k]) map[k] = c; };
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MAESTRO_ALIAS_PROVEEDOR');
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getDataRange().getValues();
      var h = v[0].map(function (x) { return String(x || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); });
      var iC = -1, iA = -1;
      h.forEach(function (x, i) { if (iC < 0 && /CANON|OFICIAL|MAESTRO|NORMALIZ|ESTANDAR/.test(x)) iC = i; });
      h.forEach(function (x, i) { if (iA < 0 && i !== iC && /ALIAS|ESCRIT|ORIGEN|RAW|VARIANTE|COMO|DIGIT/.test(x)) iA = i; });
      if (iC >= 0 && iA >= 0) for (var i = 1; i < v.length; i++) add(v[i][iA], v[i][iC]);
    }
  } catch (e) {}
  try {
    var al = (entMeta || avpJson_('entradas_recepcion.json')._meta || {}).aliasProveedor || [];
    al.forEach(function (a) { add(a.raw, a.canon); });
  } catch (e2) {}
  return function (nombre) { var k = avpNorm_(nombre); return canon[k] || map[k] || ''; };
}

/* ------------------------------------------------------------------ */
/*  Directorios                                                         */
/* ------------------------------------------------------------------ */

/* Llena DIRECTORIO_PROVEEDORES con los correos usados al pedir cita (los más
   recientes primero) y DIRECTORIO_PLANIFICADORES con los nombres de tránsitos.
   Nunca borra ni pisa lo que se escribió a mano: solo completa celdas vacías y
   agrega filas nuevas. */
function avpConstruirDirectorio_() {
  var maestro = avpJson_('maestro_renglones.json');
  var canon = {};
  Object.keys(maestro.catalogo || {}).forEach(function (p) { canon[avpNorm_(p)] = p; });
  var resolver = avpAlias_(Object.keys(canon).map(function (k) { return canon[k]; }));

  // Correos por proveedor desde SOLICITUDES (más recientes primero)
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sol = ss.getSheetByName('SOLICITUDES');
  var correos = {};
  if (sol && sol.getLastRow() > 1) {
    var v = sol.getDataRange().getValues(), c = avpIdx_(v[0]);
    // Columnas por nombre, tolerando variantes del encabezado.
    var busca = function (re) { for (var h in c) if (re.test(h)) return c[h]; return undefined; };
    var iE = c.EMPRESA != null ? c.EMPRESA : busca(/PROVEEDOR|EMPRESA/);
    var iC = c.CORREO != null ? c.CORREO : busca(/CORREO|EMAIL|E-MAIL/);
    var iM = c.MARCA_TEMPORAL != null ? c.MARCA_TEMPORAL : busca(/MARCA|FECHA/);
    var filas = [];
    for (var i = 1; i < v.length && iE != null && iC != null; i++) {
      var nombreCanon = resolver(v[i][iE]);
      if (!nombreCanon) continue;
      var k = avpNorm_(nombreCanon);
      String(v[i][iC] || '').split(/[,;\s]+/).forEach(function (m) {
        m = m.trim().toLowerCase();
        if (avpCorreoOk_(m) && !/@(css\.gob\.pa|torrecontrolcss\.org)$/.test(m)) filas.push([k, m, iM != null && v[i][iM] instanceof Date ? v[i][iM].getTime() : 0]);
      });
    }
    filas.sort(function (a, b) { return b[2] - a[2]; });
    filas.forEach(function (f) { var L = correos[f[0]] = correos[f[0]] || []; if (L.indexOf(f[1]) < 0 && L.length < 3) L.push(f[1]); });
  }

  var sh = avpHoja_(AVP_HOJA_DIR, ['PROVEEDOR', 'CORREO_1', 'CORREO_2', 'CORREO_3', 'DIA', 'ACTIVO', 'NOTA']);
  var d = sh.getDataRange().getValues(), h = avpIdx_(d[0]), ya = {};
  for (var j = 1; j < d.length; j++) ya[avpNorm_(d[j][h.PROVEEDOR])] = j;
  var nombres = Object.keys(canon).map(function (k) { return canon[k]; }).sort();
  var nuevos = 0, completados = 0;
  nombres.forEach(function (p, n) {
    var k = avpNorm_(p), L = correos[k] || [];
    if (ya[k] == null) {
      sh.appendRow([p, L[0] || '', L[1] || '', L[2] || '', (n % 5) + 1, 'SI', L.length ? '' : 'Sin correo en SOLICITUDES']);
      nuevos++;
    } else {
      var fila = d[ya[k]], cambio = false;
      ['CORREO_1', 'CORREO_2', 'CORREO_3'].forEach(function (col) {
        if (String(fila[h[col]] || '').trim()) return;
        var libre = L.filter(function (m) { return [fila[h.CORREO_1], fila[h.CORREO_2], fila[h.CORREO_3]].map(String).indexOf(m) < 0; })[0];
        if (libre) { fila[h[col]] = libre; cambio = true; }
      });
      if (cambio) { sh.getRange(ya[k] + 1, 1, 1, fila.length).setValues([fila]); completados++; }
    }
  });

  // Planificadores desde tránsitos
  var tr = avpJson_('transitos_oc.json').rows || [];
  var shp = avpHoja_(AVP_HOJA_PLAN, ['NOMBRE', 'CORREO', 'ACTIVO', 'NOTA']);
  if (String(shp.getRange(1, 4).getValue() || '').trim().toUpperCase() !== 'NOTA') shp.getRange(1, 4).setValue('NOTA').setFontWeight('bold');
  if (String(shp.getRange(1, 5).getValue() || '').trim().toUpperCase() !== 'COPIA') shp.getRange(1, 5).setValue('COPIA').setFontWeight('bold');
  var dp = shp.getDataRange().getValues(), yp = {};
  for (var q = 1; q < dp.length; q++) yp[avpNorm_(dp[q][0])] = true;
  var planNuevos = 0, dl = avpLeerDirectorios_();
  // La jefatura puede estar como fila propia o con el nombre de quien la ocupa: no se duplica.
  if (!yp[avpNorm_(AVP_JEFATURA)] && !dl.jefatura) { shp.appendRow([AVP_JEFATURA, '', 'SI', '']); yp[avpNorm_(AVP_JEFATURA)] = true; planNuevos++; }
  tr.forEach(function (t) {
    var nm = String(t.planificador || '').trim();
    // Un nombre que ya se reconoce en el directorio (otra forma de escribirlo) no se agrega.
    if (!nm || /RECIEN NOMBRADOS/i.test(nm) || yp[avpNorm_(nm)] || dl.planDe(nm)) return;
    shp.appendRow([nm, '', 'SI', '']); yp[avpNorm_(nm)] = true; planNuevos++;
  });
  var sug = avpSugerirCorreosPlanificadores_(shp);
  return { success: true, proveedoresNuevos: nuevos, proveedoresCompletados: completados, planificadoresNuevos: planNuevos,
           correosSugeridos: sug.sugeridos, sinCorreo: sug.sinCorreo, fuentes: sug.fuentes,
           conCorreo: Object.keys(correos).length, totalProveedores: nombres.length };
}

/* ------------------------------------------------------------------ */
/*  Correos de planificadores: se toman de los libros donde ya existen  */
/* ------------------------------------------------------------------ */
/* Los correos institucionales siguen la forma <inicio del nombre><apellido>@css.gob.pa
   (selfernandez = SELene FERNANDEZ, daiherrera = DAIra HERRERA). Se juntan los correos
   que ya usan los tableros —ALERTAS_CONFIG_ANALISTAS del libro de Curvas (correo de
   evaluación de planificadores), la lista del reporte diario de citas (REPORTE_BCC) y
   TRZ_USUARIOS— y a cada planificador sin correo se le propone el que calza con su
   nombre. Solo se llena una celda vacía, y queda NOTA "sugerido … · verificar". Si dos
   correos calzan, no se elige: se anotan los dos para que usted decida. */
var AVP_CURVAS_ID = '1ca5JUgogB25yAq2hvlLNSobUOMdTMe2oua6iUJ3c_Ew';
var AVP_JEFATURA_SUGERIDA = ['Simón Sotillo', 'sisotillo@css.gob.pa'];

function avpCorreosConocidos_() {
  var out = {}, fuentes = [];
  var add = function (m, f) { m = String(m || '').trim().toLowerCase(); if (avpCorreoOk_(m) && !out[m]) out[m] = f; };
  try {
    var id = avpProps_().getProperty('AVP_CURVAS_ID') || AVP_CURVAS_ID;
    var sh = SpreadsheetApp.openById(id).getSheetByName('ALERTAS_CONFIG_ANALISTAS');
    if (sh) { var v = sh.getDataRange().getValues(), c = avpIdx_(v[0]); for (var i = 1; i < v.length; i++) add(v[i][c.EMAIL], 'ALERTAS_CONFIG_ANALISTAS'); fuentes.push('ALERTAS_CONFIG_ANALISTAS (Curvas)'); }
  } catch (e) { fuentes.push('Curvas sin acceso: ' + String(e.message || e).slice(0, 60)); }
  try { if (typeof REPORTE_BCC !== 'undefined') { REPORTE_BCC.forEach(function (m) { add(m, 'REPORTE_BCC'); }); if (typeof REPORTE_PARA !== 'undefined') add(REPORTE_PARA, 'REPORTE_BCC'); fuentes.push('REPORTE_BCC (citas)'); } } catch (e2) {}
  try {
    var tu = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('TRZ_USUARIOS');
    if (tu) { var w = tu.getDataRange().getValues(), k = avpIdx_(w[0]); for (var j = 1; j < w.length; j++) add(w[j][k.CORREO], 'TRZ_USUARIOS'); fuentes.push('TRZ_USUARIOS'); }
  } catch (e3) {}
  return { correos: out, fuentes: fuentes };
}

function avpCalzaCorreo_(nombre, correo) {
  var w = String(nombre).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z ]/g, ' ')
    .split(/\s+/).filter(function (x) { return x.length > 1 && ['DE', 'LA', 'DEL', 'LOS'].indexOf(x) < 0; });
  if (w.length < 2) return false;
  var L = String(correo).split('@')[0].toUpperCase().replace(/[^A-Z]/g, '');
  for (var i = 1; i < w.length; i++) {
    var s = w[i];
    if (L.length > s.length && L.slice(-s.length) === s && w[0].indexOf(L.slice(0, -s.length)) === 0) return true;
  }
  return false;
}

function avpSugerirCorreosPlanificadores_(shp) {
  var con = avpCorreosConocidos_(), lista = Object.keys(con.correos);
  var v = shp.getDataRange().getValues(), sugeridos = 0, sinCorreo = 0;
  for (var i = 1; i < v.length; i++) {
    var nm = String(v[i][0] || '').trim(); if (!nm || String(v[i][1] || '').trim()) continue;
    var cand;
    if (avpNorm_(nm) === avpNorm_(AVP_JEFATURA)) {
      cand = lista.indexOf(AVP_JEFATURA_SUGERIDA[1]) >= 0 ? [AVP_JEFATURA_SUGERIDA[1]] : [];
      if (cand.length) { shp.getRange(i + 1, 2).setValue(cand[0]); shp.getRange(i + 1, 4).setValue('sugerido: ' + AVP_JEFATURA_SUGERIDA[0] + ' (jefatura en Registro de Consumos) · verificar'); sugeridos++; continue; }
    } else cand = lista.filter(function (m) { return avpCalzaCorreo_(nm, m); });
    if (cand.length === 1) { shp.getRange(i + 1, 2).setValue(cand[0]); shp.getRange(i + 1, 4).setValue('sugerido desde ' + con.correos[cand[0]] + ' · verificar'); sugeridos++; }
    else { sinCorreo++; shp.getRange(i + 1, 4).setValue(cand.length ? 'varios posibles: ' + cand.join(', ') : 'sin correo en los tableros: escríbalo'); }
  }
  return { sugeridos: sugeridos, sinCorreo: sinCorreo, fuentes: con.fuentes.join(' · ') };
}

/* resolver: función de alias (avpAlias_) para unir los nombres de CORREOS_PROVEEDORES. */
function avpLeerDirectorios_(resolver) {
  var kP = function (n) { return avpNorm_((resolver && resolver(n)) || n); };
  var sh = avpHoja_(AVP_HOJA_DIR, ['PROVEEDOR', 'CORREO_1', 'CORREO_2', 'CORREO_3', 'DIA', 'ACTIVO', 'NOTA']);
  var d = sh.getDataRange().getValues(), h = avpIdx_(d[0]), prov = {};
  for (var i = 1; i < d.length; i++) {
    var p = String(d[i][h.PROVEEDOR] || '').trim(); if (!p) continue;
    prov[kP(p)] = {
      nombre: p, dia: Number(d[i][h.DIA]) || 0,
      activo: String(d[i][h.ACTIVO] || 'SI').trim().toUpperCase() !== 'NO',
      correos: [d[i][h.CORREO_1], d[i][h.CORREO_2], d[i][h.CORREO_3]].map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(avpCorreoOk_)
    };
  }
  // CORREOS_PROVEEDORES (lista institucional del libro): sus correos activos se suman a los del directorio.
  try {
    var cp = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CORREOS_PROVEEDORES');
    if (cp && cp.getLastRow() > 1) {
      var w = cp.getDataRange().getValues();
      for (var r = 1; r < w.length; r++) {
        if (String(w[r][2] || 'SI').trim().toUpperCase() === 'NO') continue;
        var x = prov[kP(w[r][0])]; if (!x) continue;
        String(w[r][1] || '').split(/[,;\s]+/).forEach(function (m) { m = m.trim().toLowerCase(); if (avpCorreoOk_(m) && x.correos.indexOf(m) < 0) x.correos.push(m); });
      }
    }
  } catch (e) {}

  // Planificadores. En tránsitos el nombre viene escrito de varias formas ("Nohelia S.",
  // "Selene itzel Fernandez vega"): si no calza exacto, se busca por primer nombre +
  // apellidos del directorio (una inicial vale por el apellido). Solo si hay un único correo.
  var sp = avpHoja_(AVP_HOJA_PLAN, ['NOMBRE', 'CORREO', 'ACTIVO']);
  var dp = sp.getDataRange().getValues(), plan = {}, nombreDe = {}, lista = [], fijosCc = [], fijosCco = [];
  // Columna COPIA (opcional): CC = copia visible en TODOS los avisos; CCO = copia oculta en todos.
  // Sirve para jefaturas que no son planificadores. Vacía = solo cuando es el planificador del proveedor.
  var iCopia = avpIdx_(dp[0]).COPIA;
  var toks = function (s) { return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean); };
  for (var j = 1; j < dp.length; j++) {
    if (String(dp[j][2] || 'SI').trim().toUpperCase() === 'NO') continue;
    var nm = String(dp[j][0] || '').trim(), m = String(dp[j][1] || '').trim().toLowerCase();
    if (!nm || !avpCorreoOk_(m)) continue;
    var cop = iCopia != null ? String(dp[j][iCopia] || '').trim().toUpperCase() : '';
    if ((cop === 'CC' || cop === 'SI') && fijosCc.indexOf(m) < 0) fijosCc.push(m);
    else if ((cop === 'CCO' || cop === 'BCC') && fijosCco.indexOf(m) < 0) fijosCco.push(m);
    plan[avpNorm_(nm)] = m; nombreDe[avpNorm_(nm)] = nm;
    lista.push({ n: nm, m: m, t: toks(nm).filter(function (w) { return w.length > 1 && ['DE', 'LA', 'DEL', 'LOS'].indexOf(w) < 0; }) });
  }
  var cache = {};
  var buscar = function (nm) {
    var k = avpNorm_(nm); if (!k) return null;
    if (plan[k]) return { m: plan[k], n: nombreDe[k] };
    if (k in cache) return cache[k];
    var t = toks(nm), ms = {};
    if (t.length > 1) lista.forEach(function (x) {
      if (x.t.length < 2 || x.t[0] !== t[0]) return;
      var ok = x.t.slice(1).every(function (w) { return t.some(function (u) { return u === w || (u.length === 1 && w.charAt(0) === u); }); });
      if (ok) ms[x.m] = x.n;
    });
    var ks = Object.keys(ms);
    return (cache[k] = ks.length === 1 ? { m: ks[0], n: ms[ks[0]] } : null);
  };
  var jefatura = plan[avpNorm_(AVP_JEFATURA)] || plan[avpNorm_(AVP_JEFATURA_SUGERIDA[0])] || '';
  return { prov: prov, plan: plan, jefatura: jefatura, fijosCc: fijosCc, fijosCco: fijosCco,
           planDe: function (n) { var b = buscar(n); return b ? b.m : ''; },
           planNombre: function (n) { var b = buscar(n); return b ? b.n : String(n || '').trim(); } };
}

/* ------------------------------------------------------------------ */
/*  Datos: renglones vigentes por proveedor y su cobertura              */
/* ------------------------------------------------------------------ */

function avpDatos_() {
  var maestro = avpJson_('maestro_renglones.json').catalogo || {};
  var entJ = avpJson_('entradas_recepcion.json'), ent = entJ.rows || [];
  var ct = avpJson_('citas_trazabilidad.json');
  var tr = avpJson_('transitos_oc.json').rows || [];
  var sal = avpJson_('saldos_en_linea.json');
  var corte = Utilities.formatDate(new Date(Date.now() - AVP_DIAS_VIGENCIA * 864e5), 'America/Panama', 'yyyy-MM-dd');
  var entMeta = entJ._meta || {};
  var resolver = avpAlias_(Object.keys(maestro), entMeta);
  var kProv = function (n) { return avpNorm_(resolver(n) || n); };   // nombre de cualquier fuente → llave del maestro

  var ultima = {};
  ent.forEach(function (e) { var k = kProv(e.prov) + '|' + avpCod_(e.cod); if (String(e.fRec) > (ultima[k] || '')) ultima[k] = String(e.fRec); });
  var col = ct._meta.columnas, ix = {}; col.forEach(function (c, i) { ix[c] = i; });
  ct.rows.forEach(function (r) {
    var est = String(r[ix.estado] || '').toUpperCase();
    if (est !== 'ASISTIO' && est !== 'ENTREGADO') return;
    var k = kProv(r[ix.proveedor]) + '|' + avpCod_(r[ix.codigo]);
    var f = String(r[ix.fechaConfirmada] || r[ix.fechaSolicitada] || '');
    if (f > (ultima[k] || '')) ultima[k] = f;
  });
  var trans = {};
  tr.forEach(function (t) { var k = kProv(t.prov) + '|' + avpCod_(t.cod); (trans[k] = trans[k] || []).push(t); });

  var out = {};
  Object.keys(maestro).forEach(function (p) {
    var kp = avpNorm_(p), filas = [], planes = {};
    maestro[p].forEach(function (r) {
      var c = avpCod_(r.cod_abasto), k = kp + '|' + c, T = trans[k] || [];
      if (!T.length && !((ultima[k] || '') >= corte)) return;           // no vigente para este proveedor
      T.forEach(function (t) { if (t.planificador) planes[String(t.planificador).trim()] = true; });
      var s = sal.renglones && sal.renglones[c];
      if (!s || !s.puntos) return;
      var up = function (x) { return String(x.punto_canon || x.punto || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z]/g, ''); };
      var esCedis = function (x) { return !!x.es_cedis || up(x).indexOf('CEDIS') === 0; };
      var cedis = function (nom) { for (var i = 0; i < s.puntos.length; i++) { var x = s.puntos[i]; if (esCedis(x) && up(x).indexOf(nom) >= 0) return x; } return null; };
      var pa = cedis('CEDISPANAMA'), ch = cedis('CHIRIQUI'), dv = cedis('DIVISA');
      var ues = s.puntos.filter(function (x) { return !esCedis(x); });
      var conCob = ues.filter(function (x) { return x.cobertura != null; });
      var pend = 0, venc = '';
      T.forEach(function (t) { var sd = Number(t.saldo) || 0; if (sd > 0) { pend += sd; if (t.vencEntrega && (!venc || t.vencEntrega < venc)) venc = String(t.vencEntrega); } });
      filas.push({
        cod: c, desc: r.desc || '',
        pa: pa ? pa.cobertura : null, ch: ch ? ch.cobertura : null, dv: dv ? dv.cobertura : null,
        sPa: pa ? Number(pa.saldo) || 0 : null, sCh: ch ? Number(ch.saldo) || 0 : null, sDv: dv ? Number(dv.saldo) || 0 : null,
        nac: Number(s.total_nacional) || 0,
        ue: s.total_consumo_ue ? (Number(s.total_ue) || 0) / Number(s.total_consumo_ue) : null,
        ueSaldo: Number(s.total_ue) || 0,
        ueEsc: conCob.filter(function (x) { return Number(x.cobertura) < 1; }).length, ueN: conCob.length,
        pend: pend, venc: venc
      });
    });
    if (filas.length) {
      filas.sort(function (a, b) { return (a.pa == null ? 99 : a.pa) - (b.pa == null ? 99 : b.pa); });
      out[kp] = { nombre: p, filas: filas, planificadores: Object.keys(planes) };
    }
  });
  return { resolver: resolver, porProveedor: out, saldosAl: String((sal._meta && sal._meta.generado) || '').slice(0, 10) };
}

/* ------------------------------------------------------------------ */
/*  Correo                                                              */
/* ------------------------------------------------------------------ */

function avpPill_(m) {
  if (m == null) return '<span style="color:#999">s/d</span>';
  var r = Math.round(Number(m) * 10) / 10;
  var c = r < 1 ? ['#fde8ea', '#9b1c2c'] : (r < 3 ? ['#fff3d6', '#8a5a00'] : ['#e3f4e8', '#2d6a3e']);
  return '<span style="background:' + c[0] + ';color:' + c[1] + ';padding:1px 7px;border-radius:9px;font-weight:600;white-space:nowrap">' + r.toFixed(1) + ' m</span>';
}

/* Celda de un punto: saldo en unidades arriba y su cobertura debajo. */
function avpCelda_(saldo, cob) {
  if (saldo == null) return '<span style="color:#999">—</span>';
  return '<div style="font-family:Consolas,monospace;' + (saldo <= 0 ? 'color:#9b1c2c;font-weight:700' : '') + '">' + avpFmt_(saldo) + '</div><div style="margin-top:2px">' + avpPill_(cob) + '</div>';
}

function avpHtml_(p, saldosAl, franja, contacto, version) {
  var F = p.filas, hoy = avpHoy_();
  var crit = F.filter(function (x) { return x.pa != null && Math.round(x.pa * 10) / 10 < 1; }).length;
  var conPend = F.filter(function (x) { return x.pend > 0; }).length;
  var ueTxt = (function () {
    var s = 0, cons = 0;
    F.forEach(function (x) { if (x.ue != null) { s += x.ueSaldo; cons += x.ueSaldo / (x.ue || 1e-9); } });
    return cons ? (s / cons).toFixed(1) + ' meses' : 'sin dato';
  })();
  var filas = F.slice(0, AVP_MAX_FILAS).map(function (x) {
    var vencTxt = x.pend > 0 && x.venc ? (x.venc < hoy ? '<div style="font-size:11px;color:#9b1c2c">vencimiento ' + x.venc.slice(8, 10) + '/' + x.venc.slice(5, 7) + '</div>' : '<div style="font-size:11px;color:#777">vencimiento ' + x.venc.slice(8, 10) + '/' + x.venc.slice(5, 7) + '</div>') : '';
    return '<tr><td style="padding:7px 8px;border-bottom:1px solid #e6e9ee"><b style="color:#0C447C;font-family:Consolas,monospace">' + x.cod + '</b> ' + avpEsc_(String(x.desc).slice(0, 70)) + '</td>' +
      '<td style="text-align:center;border-bottom:1px solid #e6e9ee">' + avpCelda_(x.sPa, x.pa) + '</td>' +
      '<td style="text-align:center;border-bottom:1px solid #e6e9ee">' + avpCelda_(x.sCh, x.ch) + '</td>' +
      '<td style="text-align:center;border-bottom:1px solid #e6e9ee">' + avpCelda_(x.sDv, x.dv) + '</td>' +
      '<td style="text-align:center;border-bottom:1px solid #e6e9ee">' + avpCelda_(x.ueSaldo, x.ue) + '<div style="font-size:11px;color:#777">' + x.ueEsc + ' de ' + x.ueN + ' UE bajo 1 mes</div></td>' +
      '<td style="text-align:right;padding-right:6px;border-bottom:1px solid #e6e9ee;font-family:Consolas,monospace;font-weight:600">' + avpFmt_(x.nac) + '</td>' +
      '<td style="text-align:right;padding-right:8px;border-bottom:1px solid #e6e9ee;font-family:Consolas,monospace">' + (x.pend > 0 ? avpFmt_(x.pend) : '—') + vencTxt + '</td></tr>';
  }).join('');
  var resto = F.length > AVP_MAX_FILAS ? '<p style="font-size:12px;color:#666">Se muestran los ' + AVP_MAX_FILAS + ' más críticos de ' + F.length + '. Los demás se consultan en Solicitud de Cita al elegir el renglón.</p>' : '';
  return '<div style="font-family:Segoe UI,Arial,sans-serif;color:#222;max-width:900px">' + (franja || '') +
    '<div style="background:#0C447C;color:#fff;padding:16px 20px"><table role="presentation"><tr><td style="padding-right:12px"><img src="' + AVP_BASE + 'icons/icon-192.png" width="44" height="44" alt="CSS" style="background:#fff;border-radius:50%"></td><td>' +
    '<div style="font-size:19px;font-weight:700">Informe referencial de cobertura · ' + avpEsc_(p.nombre) + '</div>' +
    '<div style="font-size:12.5px;opacity:.9">Caja de Seguro Social · Dirección Nacional de Logística · Saldos al ' + saldosAl.split('-').reverse().join('/') + '</div></td></tr></table></div>' +
    '<div style="padding:16px 20px;font-size:14px;line-height:1.5;border:1px solid #ddd;border-top:0">' +
    '<p>Estimado proveedor: a título informativo, le compartimos una <b>estimación</b> del inventario y la cobertura de los <b>' + F.length + ' renglones</b> que tiene adjudicados con la CSS, según los datos registrados en nuestros sistemas a la fecha de corte, en los CEDIS Panamá, Chiriquí y Divisa y en la red de unidades ejecutoras. La cobertura conjunta estimada en las UE es de <b>' + ueTxt + '</b>. ' +
    (crit ? 'Según estos datos, ' + crit + (crit === 1 ? ' renglón estaría' : ' renglones estarían') + ' por debajo de un mes de cobertura en CEDIS Panamá. ' : '') +
    (conPend ? 'Los registros muestran saldo pendiente de entrega en ' + conPend + (conPend === 1 ? ' renglón' : ' renglones') + '. ' : '') +
    'Con base en esta información, se sugiere programar su capacidad de suministro e indicar a su planificador las fechas estimadas de disponibilidad. Las entregas se requieren mediante la Orden de Solicitud de Entrega o la orden de compra, y las citas de recepción se agendan en <a href="' + AVP_BASE + 'solicitud_cita.html">Solicitud de Cita</a>.</p>' +
    '<p style="background:#eef4fb;border-left:4px solid #1e5a9e;padding:8px 12px"><b>Valide estos datos con el planificador correspondiente</b> antes de programar entregas o gestionar órdenes de compra. ' + (contacto || 'Jefatura de Planificación de la Dirección Nacional de Logística') + '.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#1e5a9e;color:#fff"><th style="text-align:left;padding:8px">Renglón</th><th>CEDIS Panamá</th><th>CEDIS Chiriquí</th><th>CEDIS Divisa</th><th>Red de UE</th><th style="text-align:right;padding-right:6px">Inventario nacional</th><th style="text-align:right;padding-right:8px">Pendiente según registros</th></tr></thead><tbody>' + filas + '</tbody></table>' + resto +
    '<p style="font-size:12px;color:#666;margin-top:12px">En cada punto: arriba el saldo en unidades, abajo su cobertura. Inventario nacional = CEDIS + unidades ejecutoras. Cobertura = saldo ÷ consumo mensual, en meses. Rojo: menos de 1 mes · ámbar: de 1 a 3 · verde: 3 o más · s/d: sin dato de consumo. "Pendiente según registros" = saldo de órdenes de compra y solicitudes de entrega registrado por Planificación a la fecha de corte. El detalle por unidad ejecutora está en Solicitud de Cita, al elegir el renglón.</p>' +
    '<p style="font-size:11.5px;color:#555;line-height:1.45;border-top:1px solid #ddd;padding-top:10px;margin-top:14px">' + avpEsc_(version === 'PLAN' ? AVP_PIE_PLAN : AVP_PIE_PROV) + '</p>' +
    '<p style="font-size:12px;color:#666">Se envía una vez por semana. Consultas: Planificación · DINALOG.</p></div></div>';
}

function avpEnviarBrevo_(para, cc, asunto, html, cco) {
  var key = avpProps_().getProperty('AVP_BREVO_KEY'), rem = avpProps_().getProperty('AVP_REMITENTE');
  if (!key || !rem) throw new Error('Faltan AVP_BREVO_KEY o AVP_REMITENTE en las propiedades del script.');
  var body = { sender: { name: 'Torre de Control · DINALOG', email: rem }, to: para.map(function (m) { return { email: m }; }), subject: asunto, htmlContent: html };
  if (cc.length) body.cc = cc.map(function (m) { return { email: m }; });
  if (cco && cco.length) body.bcc = cco.map(function (m) { return { email: m }; });
  var r = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', { method: 'post', contentType: 'application/json',
    headers: { 'api-key': key, accept: 'application/json' }, payload: JSON.stringify(body), muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) throw new Error('Brevo respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
}

/* ------------------------------------------------------------------ */
/*  Envío del día                                                       */
/* ------------------------------------------------------------------ */

/* dia: 1..5 (lunes..viernes); vacío = el de hoy. soloProveedor: nombre exacto o normalizado.
   simular: no envía nada, solo cuenta. */
function avpEnviar_(opc) {
  opc = opc || {};
  var props = avpProps_(), modo = String(props.getProperty('AVP_MODO') || 'PRUEBA').toUpperCase();
  var prueba = modo !== 'REAL' || !!opc.forzarPrueba;
  var correoPrueba = props.getProperty('AVP_CORREO_PRUEBA') || Session.getEffectiveUser().getEmail();
  var cuota = Number(props.getProperty('AVP_CUOTA') || 280);
  var dia = opc.dia || Number(Utilities.formatDate(new Date(), 'America/Panama', 'u'));   // 1 = lunes
  if (!opc.soloProveedor && !opc.todos && (dia < 1 || dia > 5)) return { success: true, mensaje: 'Fin de semana: no se envía.' };

  var datos = avpDatos_(), dir = avpLeerDirectorios_(datos.resolver);
  var bit = avpHoja_(AVP_HOJA_BIT, ['FECHA', 'MODO', 'PROVEEDOR', 'PARA', 'CC', 'RENGLONES', 'CRITICOS_CEDIS_PMA', 'RESULTADO']);
  var lista = Object.keys(datos.porProveedor).map(function (k) { return { k: k, p: datos.porProveedor[k], d: dir.prov[k] }; });
  if (opc.soloProveedor) { var ks = avpNorm_(opc.soloProveedor); lista = lista.filter(function (x) { return x.k === ks; }); }
  else if (opc.todos) lista = lista.filter(function (x) { return x.d && x.d.activo; });
  else lista = lista.filter(function (x) { return x.d && x.d.activo && x.d.dia === dia; });

  // Nadie recibe dos avisos reales en menos de 6 días (p. ej. tras un envío a todos).
  var recientes = {}, omitidos = 0;
  if (!prueba && !opc.soloProveedor) {
    var bv = bit.getDataRange().getValues(), bh = avpIdx_(bv[0]), lim = Date.now() - 6 * 864e5;
    for (var b = 1; b < bv.length; b++) {
      var f = bv[b][bh.FECHA];
      if (/^(ENVIADO|SIN CORREO · )/.test(String(bv[b][bh.RESULTADO])) && f instanceof Date && f.getTime() >= lim) recientes[avpNorm_(bv[b][bh.PROVEEDOR])] = true;
    }
    lista = lista.filter(function (x) { if (recientes[x.k]) { omitidos++; return false; } return true; });
  }

  var usados = 0, enviados = 0, sinCorreo = [], errores = [];
  lista.forEach(function (x) {
    var para = (x.d && x.d.correos) || [];
    var cc = [];
    x.p.planificadores.forEach(function (n) { var m = dir.planDe(n); if (m && cc.indexOf(m) < 0) cc.push(m); });
    if (!cc.length && dir.jefatura) cc.push(dir.jefatura);
    dir.fijosCc.forEach(function (m) { if (cc.indexOf(m) < 0) cc.push(m); });
    var cco = dir.fijosCco.filter(function (m) { return cc.indexOf(m) < 0; });
    var crit = x.p.filas.filter(function (f) { return f.pa != null && Math.round(f.pa * 10) / 10 < 1; }).length;
    // Dos correos por proveedor: (1) al proveedor, con el pie para proveedores; (2) copia interna a
    // Planificación (planificadores o Jefatura, más las copias fijas), con el pie para planificadores.
    // Si el proveedor no tiene correo, Planificación igual recibe su copia para gestionarlo.
    if (!para.length) sinCorreo.push(x.p.nombre);
    var nDest = para.length + cc.length + cco.length;
    if (!prueba && usados + nDest > cuota) { errores.push(x.p.nombre + ': cuota del día'); return; }
    var franja = prueba ? '<div style="background:#fff3d6;border:1px solid #e0c97a;padding:8px 12px;font-size:12.5px;margin-bottom:8px"><b>PRUEBA · versión proveedor</b> · habría ido a: ' + avpEsc_(para.join(', ') || 'nadie: el proveedor no tiene correo en DIRECTORIO_PROVEEDORES') + '</div>' : '';
    var franjaPlan = '<div style="background:#e8f0fa;border:1px solid #9db8dc;padding:8px 12px;font-size:12.5px;margin-bottom:8px">' + (prueba ? '<b>PRUEBA · copia interna</b> · habría ido a: ' + avpEsc_(cc.join(', ') || 'nadie (falta correo de planificador y de Jefatura)') + (cco.length ? ' · copia oculta: ' + avpEsc_(cco.join(', ')) : '') + '<br>' : '') +
      '<b>Copia interna para Planificación.</b> Este es el aviso que recibió el proveedor ' + avpEsc_(x.p.nombre) + (para.length ? ' (' + avpEsc_(para.join(', ')) + ')' : ' — <b>sin correo registrado: no se le envió</b>') + '.</div>';
    var asunto = (prueba ? '[PRUEBA] ' : '') + 'Informe referencial de cobertura de sus renglones · CSS · ' + x.p.nombre;
    var asuntoPlan = (prueba ? '[PRUEBA] ' : '') + '[Copia interna] Cobertura de renglones · ' + x.p.nombre;
    if (opc.simular) { usados += nDest; enviados++; return; }
    try {
      // Contacto de Planificación que se nombra en el cuerpo: sus planificadores (con correo si lo hay) o la Jefatura.
      // Un mismo planificador puede venir escrito de dos formas ("Selene Fernández" / "Selene itzel Fernandez vega"):
      // se quita el nombre cuyas palabras ya están en otro, y el que comparte correo con otro.
      var tok = function (s) { return String(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean); };
      var vistos = {}, planes = x.p.planificadores.slice().sort(function (a, b) { return tok(a).length - tok(b).length; }).filter(function (nm, i, arr) {
        var t = tok(nm), m = dir.planDe(nm);
        if (m && vistos[m]) return false;
        var dentro = arr.some(function (o, j) { if (j >= i) return false; var u = tok(o); return u.every(function (w) { return t.indexOf(w) >= 0; }); });
        if (dentro) return false;
        if (m) vistos[m] = true; return true;
      });
      var nombres = planes.map(function (n) { var m = dir.planDe(n); return '<b>' + avpEsc_(dir.planNombre(n)) + '</b>' + (m ? ' (<a href="mailto:' + m + '">' + avpEsc_(m) + '</a>)' : ''); });
      var contacto = nombres.length ? (nombres.length === 1 ? 'Planificador(a) correspondiente: ' : 'Planificadores correspondientes: ') + nombres.join(', ')
        : (dir.jefatura ? 'Contacto: Jefatura de Planificación (<a href="mailto:' + dir.jefatura + '">' + avpEsc_(dir.jefatura) + '</a>)' : '');
      var html = avpHtml_(x.p, datos.saldosAl, franja, contacto, 'PROV');
      var htmlPlan = avpHtml_(x.p, datos.saldosAl, franjaPlan, contacto, 'PLAN');
      // Sin clave Brevo, las PRUEBAS salen por Gmail del script (a usted).
      var envia = function (a, as, h, b) {
        if (prueba && !props.getProperty('AVP_BREVO_KEY')) MailApp.sendEmail({ to: a.join(','), subject: as, htmlBody: h, name: 'Torre de Control · DINALOG' });
        else avpEnviarBrevo_(a, [], as, h, b || []);
      };
      var res = [];
      if (para.length) { envia(prueba ? [correoPrueba] : para, asunto, html); res.push('proveedor'); }
      if (cc.length || cco.length) {
        try { envia(prueba ? [correoPrueba] : (cc.length ? cc : cco), asuntoPlan, htmlPlan, prueba || !cc.length ? [] : cco); res.push('copia interna'); }
        catch (ePlan) { res.push('copia interna ERROR ' + ePlan.message); errores.push(x.p.nombre + ' (copia interna): ' + ePlan.message); }
      }
      usados += prueba ? res.length : nDest; if (para.length) enviados++;
      bit.appendRow([new Date(), modo, x.p.nombre, para.join(', '), cc.concat(cco).join(', '), x.p.filas.length, crit,
        (prueba ? 'PRUEBA → ' + correoPrueba + ' · ' : (para.length ? 'ENVIADO' : 'SIN CORREO')) + (res.length ? ' · ' + res.join(' + ') : '')]);
    } catch (e) {
      errores.push(x.p.nombre + ': ' + e.message);
      bit.appendRow([new Date(), modo, x.p.nombre, para.join(', '), cc.join(', '), x.p.filas.length, crit, 'ERROR ' + e.message]);
    }
  });
  return { success: errores.length === 0 || enviados > 0, modo: prueba ? 'PRUEBA' : 'REAL', dia: AVP_DIAS[dia] || '', proveedores: lista.length,
           enviados: enviados, destinatarios: usados, sinCorreo: sinCorreo, errores: errores,
           mensaje: (opc.simular ? 'Simulación: ' : '') + enviados + ' aviso(s) ' + (prueba ? 'de prueba ' : '') + 'para ' + lista.length + ' proveedor(es) ' + (opc.todos ? 'de toda la semana' : 'del ' + (AVP_DIAS[dia] || 'día')) +
             (omitidos ? ' · ' + omitidos + ' ya recibieron aviso en los últimos 6 días' : '') +
             ' · ' + usados + ' destinatarios' + (sinCorreo.length ? ' · ' + sinCorreo.length + ' sin correo' : '') + (errores.length ? ' · ' + errores.length + ' con error' : '') };
}

/* Resumen de la semana para la Administración (sin enviar nada). */
function avpResumen_() {
  var datos = avpDatos_(), dir = avpLeerDirectorios_(datos.resolver), porDia = [0, 0, 0, 0, 0, 0], sinCorreo = 0, sinPlan = 0, n = 0;
  Object.keys(datos.porProveedor).forEach(function (k) {
    var d = dir.prov[k], p = datos.porProveedor[k]; n++;
    if (!d || !d.correos.length) sinCorreo++;
    if (d && d.activo && d.dia >= 1 && d.dia <= 5) porDia[d.dia]++;
    if (!p.planificadores.some(function (x) { return dir.planDe(x); })) sinPlan++;
  });
  return { success: true, proveedores: n, sinCorreo: sinCorreo, sinPlanificador: sinPlan, jefatura: !!dir.jefatura,
           porDia: { lunes: porDia[1], martes: porDia[2], miercoles: porDia[3], jueves: porDia[4], viernes: porDia[5] },
           mensaje: n + ' proveedores con renglones vigentes · ' + sinCorreo + ' sin correo · ' + sinPlan + ' sin planificador con correo' + (dir.jefatura ? '' : ' · falta el correo de la Jefatura') +
             ' · por día L ' + porDia[1] + ' / M ' + porDia[2] + ' / X ' + porDia[3] + ' / J ' + porDia[4] + ' / V ' + porDia[5] };
}

/* ------------------------------------------------------------------ */
/*  Disparador y funciones para el editor                               */
/* ------------------------------------------------------------------ */

/* Disparador de lunes a viernes, 7 a. m. Nunca lanza. */
function avpDiario() {
  try {
    var r = avpEnviar_({});
    Logger.log('Aviso a proveedores: ' + r.mensaje + (r.errores && r.errores.length ? ' · ' + r.errores.join(' | ') : ''));
  } catch (e) { Logger.log('avpDiario ERROR: ' + e); }
}

function avpInstalar() {
  var r = avpConstruirDirectorio_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'avpDiario') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('avpDiario').timeBased().everyDays(1).atHour(7).inTimezone('America/Panama').create();
  if (!avpProps_().getProperty('AVP_MODO')) avpProps_().setProperty('AVP_MODO', 'PRUEBA');
  Logger.log('Directorio: ' + r.totalProveedores + ' proveedores (' + r.proveedoresNuevos + ' nuevos, ' + r.conCorreo + ' con correo en SOLICITUDES) · ' + r.planificadoresNuevos + ' planificadores nuevos.');
  Logger.log('Planificadores: ' + r.correosSugeridos + ' correos sugeridos · ' + r.sinCorreo + ' sin correo · fuentes: ' + r.fuentes);
  Logger.log('Disparador avpDiario creado (todos los días 7 a. m.; sábado y domingo no envía). Modo: ' + avpProps_().getProperty('AVP_MODO'));
  Logger.log(avpResumen_().mensaje);
}

function avpDesinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'avpDiario') ScriptApp.deleteTrigger(t); });
  Logger.log('Disparador avpDiario eliminado.');
}

/* Envía YA a todos los proveedores activos, sin esperar su día. Los que lo reciban hoy
   no vuelven a recibirlo en su día de esta semana (regla de 6 días). Respeta AVP_MODO
   y AVP_CUOTA (con el plan Starter de Brevo, ponga AVP_CUOTA = 1000). */
function avpEnviarTodosAhora() {
  var r = avpEnviar_({ todos: true });
  Logger.log(r.mensaje + (r.errores.length ? ' · ' + r.errores.join(' | ') : '') + (r.sinCorreo.length ? ' · sin correo: ' + r.sinCorreo.join(', ') : ''));
  return r;
}

/* Manda a AVP_CORREO_PRUEBA el aviso del proveedor con más renglones vigentes. */
function avpProbar(proveedor) {
  var nombre = proveedor;
  if (!nombre) {
    var d = avpDatos_(), mejor = null;
    Object.keys(d.porProveedor).forEach(function (k) { var p = d.porProveedor[k]; if (!mejor || p.filas.length > mejor.filas.length) mejor = p; });
    nombre = mejor && mejor.nombre;
  }
  var r = avpEnviar_({ soloProveedor: nombre, forzarPrueba: true });
  Logger.log(r.mensaje + (r.errores.length ? ' · ' + r.errores.join(' | ') : '') + (r.sinCorreo.length ? ' · sin correo: ' + r.sinCorreo.join(', ') : ''));
  return r;
}
