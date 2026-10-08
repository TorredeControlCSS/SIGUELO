/**
 * ============================================================================
 *  PANEL_ADMIN · Administración de panel_confirmacion + copia rápida del panel
 *  Diego Bethancourth · Torre de Control · DINALOG · CSS
 *  Proyecto: SIGUELO Backend (libro BASE DE DATOS DE CITAS)
 * ----------------------------------------------------------------------------
 *  Archivo NUEVO dentro del mismo proyecto. No modifica funciones existentes.
 *
 *  1) Pestaña "Administración" de panel_confirmacion (reemplaza al Kanban):
 *     - Alta de renglones por proveedor en MAESTRO_PROVEEDORES (lo que ve el
 *       proveedor en solicitud_cita), con control de duplicados, nombre de
 *       proveedor canónico y publicación inmediata de maestro_renglones.json.
 *     - Activar / desactivar renglones (no se borra nada).
 *     - Las tareas del menú ⚙ SÍGUELO, para que nadie entre al libro.
 *     Ingreso con el PIN de TRZ_USUARIOS (el de Trazabilidad). Solo los roles
 *     de ADM_ROLES pueden usarla; el servidor valida PIN y rol en CADA acción.
 *     Toda acción queda en la hoja ADM_BITACORA (se crea sola).
 *
 *  2) Copia rápida del panel: panel_confirmacion.json en GitHub Pages con la
 *     lista activa y el calendario de m-1 a m+2. El panel la pinta al instante
 *     y luego confirma con SIGUELO. NO incluye datos personales (solicitante,
 *     correo, teléfono, placa, personal de entrega), ni enlaces de sustento,
 *     ni lotes: esos llegan solo con la consulta en vivo.
 *     Se regenera desde citasTrazDiferido_ (cada 15 min) y solo si cambió la
 *     versión de datos de SIGUELO; si no hubo cambios no consulta nada.
 *
 *  INSTALACIÓN: pegar este archivo y reemplazar TRAZABILIDAD_RB.gs y
 *  CITAS_TRAZABILIDAD.gs por sus versiones completas de esta entrega (ya traen
 *  los enganches). No hay que tocar Código.gs. Luego:
 *    a) Ejecutar panelPublicarAhora() una vez desde el editor (autoriza y
 *       publica la primera copia).
 *    b) Implementar > Gestionar implementaciones > editar > Nueva versión.
 *    c) Para dar acceso a un analista: en TRZ_USUARIOS poner ROL = ADMIN.
 *       (SUPERVISOR también entra.)
 *
 *  REVERSIÓN: borrar este archivo. Los enganches usan typeof y quedan inertes.
 * ============================================================================
 */

var ADM_ROLES = ['SUPERVISOR', 'ADMIN'];
var ADM_HOJA_BITACORA = 'ADM_BITACORA';
var ADM_HOJA_MAESTRO = 'MAESTRO_PROVEEDORES';

var PANEL_GH_PATH = 'panel_confirmacion.json';
var PANEL_PROP_HUELLA = 'PANEL_HUELLA';
var PANEL_PROP_CLAVE = 'PANEL_CLAVE';
var PANEL_CAMPOS_PRIVADOS = ['solicitante', 'correo', 'telefono', 'unidad_movil', 'personal_entrega', 'link_sustento', 'lotes_json'];

/* ------------------------------------------------------------------ */
/*  Enrutamiento (lo llaman trzRuta_ / trzPost_ de TRAZABILIDAD_RB.gs)  */
/* ------------------------------------------------------------------ */

function admRuta_(e) {
  return null;   // todo va por POST con PIN
}

function admPost_(payload) {
  var a = String((payload && payload.action) || '');
  if (a.indexOf('adm') !== 0) return null;
  try {
    var d = payload.data || {};
    if (a === 'admLogin') return admLogin_(d);
    var u = admAutorizar_(d.pin);
    if (u.error) return { success: false, error: u.error, sesion: !!u.sesion };
    if (a === 'admMaestro')       return admMaestro_();
    if (a === 'admRenglonCrear')  return admRenglonCrear_(d, u);
    if (a === 'admRenglonActivo') return admRenglonActivo_(d, u);
    if (a === 'admTarea')         return admTarea_(d, u);
    if (a === 'admDisparadores')  return admDisparadores_();
    return { success: false, error: 'Acción de administración no reconocida.' };
  } catch (err) {
    return { success: false, error: 'Error interno: ' + String(err && err.message || err) };
  }
}

/* ------------------------------------------------------------------ */
/*  Acceso                                                              */
/* ------------------------------------------------------------------ */

function admLogin_(d) {
  var r = trzAutenticar_(d.pin);
  if (r.error) return { success: false, error: r.error };
  var u = r.usuario, ok = ADM_ROLES.indexOf(u.rol) >= 0;
  trzAuditar_(d.pin, ok ? 'INGRESO_ADMIN' : 'ADMIN_SIN_PERMISO', u.nombre);
  return { success: true, nombre: u.nombre, area: u.area, rol: u.rol, admin: ok,
           pasos: trzPasosDeArea_(u.area, u.rol) };
}

/* Devuelve el usuario o {error, sesion}. sesion:true pide al panel volver a ingresar. */
function admAutorizar_(pin) {
  var r = trzAutenticar_(pin);
  if (r.error) return { error: r.error, sesion: true };
  if (ADM_ROLES.indexOf(r.usuario.rol) < 0) return { error: 'Su usuario no tiene permiso de administración (rol ' + r.usuario.rol + ').' };
  return r.usuario;
}

function admBitacora_(u, accion, detalle, resultado) {
  try {
    var sh = trzHoja_(ADM_HOJA_BITACORA, ['TS', 'USUARIO', 'ACCION', 'DETALLE', 'RESULTADO']);
    sh.appendRow([new Date(), (u && u.nombre) || '', accion, String(detalle || '').slice(0, 500), String(resultado || '').slice(0, 500)]);
  } catch (e) {}
}

/* ------------------------------------------------------------------ */
/*  Maestro de proveedores                                              */
/* ------------------------------------------------------------------ */

function admCod_(c) {
  if (typeof normalizarCodigo_ === 'function') return String(normalizarCodigo_(c) || '').toUpperCase();
  return String(c == null ? '' : c).replace(/\.0+$/, '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

function admNormProv_(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.,&]/g, ' ').replace(/\b(S A|SA|CIA|INC|CORP)\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function admPunto_(s) { return /\.$/.test(s) ? s : s + '.'; }

function admHojaMaestro_() {
  var nombre = (typeof MAESTRO_PROV_SHEET !== 'undefined') ? MAESTRO_PROV_SHEET : ADM_HOJA_MAESTRO;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!sh) throw new Error("No existe la hoja '" + nombre + "'.");
  return sh;
}

function admLeerMaestro_() {
  var sh = admHojaMaestro_();
  var v = sh.getDataRange().getValues();
  var hdr = v[0].map(function (h) { return String(h || '').trim().toUpperCase(); });
  var ix = {};
  hdr.forEach(function (h, i) { if (h && ix[h] === undefined) ix[h] = i; });
  if (ix.PROVEEDOR === undefined || ix.COD_ABASTO === undefined)
    throw new Error('La hoja del maestro no tiene las columnas PROVEEDOR / COD_ABASTO.');
  return { sh: sh, v: v, hdr: hdr, ix: ix };
}

function admMaestro_() {
  var m = admLeerMaestro_(), ix = m.ix, out = [];
  var g = function (row, k) { return ix[k] === undefined ? '' : String(row[ix[k]] == null ? '' : row[ix[k]]).trim(); };
  for (var i = 1; i < m.v.length; i++) {
    var p = g(m.v[i], 'PROVEEDOR'), c = admCod_(m.v[i][ix.COD_ABASTO]);
    if (!p || !c) continue;
    out.push({ p: p, c: c, s: g(m.v[i], 'COD_SAP'), d: g(m.v[i], 'DESCRIPCION'), cat: g(m.v[i], 'CATEGORIA').toUpperCase(),
               pres: g(m.v[i], 'PRESENTACION'), o: g(m.v[i], 'ORIGEN'), a: (g(m.v[i], 'ACTIVO').toUpperCase() === 'NO') ? 'NO' : 'SI' });
  }
  return { success: true, filas: out, total: out.length };
}

/* Invalida la caché del maestro y publica maestro_renglones.json (lo que lee solicitud_cita). */
function admPublicarMaestro_() {
  try { if (typeof invalidarCacheMaestro === 'function') invalidarCacheMaestro(); } catch (e) {}
  if (typeof maestroPublicarGitHub_ !== 'function') return { success: false, error: 'maestroPublicarGitHub_ no está en el proyecto.' };
  return maestroPublicarGitHub_();
}

function admRenglonCrear_(d, u) {
  var prov = String(d.proveedor || '').replace(/\s+/g, ' ').trim();
  var cod  = admCod_(d.cod_abasto);
  var desc = String(d.descripcion || '').replace(/\s+/g, ' ').trim();
  var cat  = String(d.categoria || '').replace(/\s+/g, ' ').trim().toUpperCase();
  var sap  = String(d.cod_sap || '').trim();
  var pres = String(d.presentacion || '').replace(/\s+/g, ' ').trim();
  var falta = [];
  if (!prov) falta.push('proveedor'); if (!cod) falta.push('código de abasto');
  if (!desc) falta.push('descripción'); if (!cat) falta.push('categoría');
  if (falta.length) return { success: false, error: 'Falta: ' + falta.join(', ') + '.' };
  if (!/^[0-9A-Z]{5,15}$/.test(cod)) return { success: false, error: 'El código de abasto debe tener entre 5 y 15 letras o números.' };
  if (prov.length > 150 || desc.length > 400) return { success: false, error: 'Proveedor o descripción demasiado largos.' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { success: false, error: 'SIGUELO está ocupado guardando otro cambio. Intente en unos segundos.' };
  var nuevoProv = true;
  try {
    var m = admLeerMaestro_(), ix = m.ix, nProv = admNormProv_(prov);
    // Nombre oficial: si ya existe el proveedor (aunque se haya escrito distinto), se usa ese.
    for (var i = 1; i < m.v.length; i++) {
      var p = String(m.v[i][ix.PROVEEDOR] || '').trim();
      if (p && admNormProv_(p) === nProv) { prov = p; nuevoProv = false; break; }
    }
    for (var j = 1; j < m.v.length; j++) {
      if (String(m.v[j][ix.PROVEEDOR] || '').trim() !== prov) continue;
      if (admCod_(m.v[j][ix.COD_ABASTO]) !== cod) continue;
      var inactivo = ix.ACTIVO !== undefined && String(m.v[j][ix.ACTIVO]).trim().toUpperCase() === 'NO';
      return { success: false, inactivo: inactivo,
               error: inactivo ? 'El renglón ya existe para este proveedor pero está inactivo: use "Activar".'
                               : 'El renglón ' + cod + ' ya está en el catálogo de ' + admPunto_(prov) };
    }
    var ahora = new Date();
    var fila = m.hdr.map(function (h) {
      switch (h) {
        case 'PROVEEDOR':      return prov;
        case 'COD_ABASTO':     return cod;
        case 'COD_SAP':        return sap;
        case 'DESCRIPCION':    return desc;
        case 'CATEGORIA':      return cat;
        case 'PRESENTACION':   return pres;
        case 'ORIGEN':         return 'adjudicado';
        case 'ACTIVO':         return 'SI';
        case 'FECHA_REGISTRO': return ahora;
        case 'REGISTRADO_POR': return u.nombre;
        default:               return '';
      }
    });
    m.sh.getRange(m.sh.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  var pub = admPublicarMaestro_();
  admBitacora_(u, 'RENGLON_CREAR', prov + ' | ' + cod + ' | ' + desc + ' | ' + cat, pub.success ? 'OK · publicado' : 'OK · sin publicar: ' + pub.error);
  return { success: true, proveedor: prov, proveedorNuevo: nuevoProv, publicado: !!pub.success, aviso: pub.success ? '' : pub.error,
           mensaje: 'Renglón ' + cod + ' agregado a ' + (nuevoProv ? prov + ' (proveedor nuevo en el catálogo).' : admPunto_(prov)) };
}

function admRenglonActivo_(d, u) {
  var prov = String(d.proveedor || '').trim(), cod = admCod_(d.cod_abasto);
  var val = String(d.activo || '').toUpperCase() === 'NO' ? 'NO' : 'SI';
  if (!prov || !cod) return { success: false, error: 'Falta proveedor o código.' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { success: false, error: 'SIGUELO está ocupado. Intente en unos segundos.' };
  var n = 0;
  try {
    var m = admLeerMaestro_(), ix = m.ix;
    if (ix.ACTIVO === undefined) return { success: false, error: 'La hoja del maestro no tiene la columna ACTIVO.' };
    for (var i = 1; i < m.v.length; i++) {
      if (String(m.v[i][ix.PROVEEDOR] || '').trim() === prov && admCod_(m.v[i][ix.COD_ABASTO]) === cod) {
        m.sh.getRange(i + 1, ix.ACTIVO + 1).setValue(val); n++;
      }
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  if (!n) return { success: false, error: 'No se encontró el renglón ' + cod + ' de ' + prov + '.' };
  var pub = admPublicarMaestro_();
  admBitacora_(u, val === 'NO' ? 'RENGLON_DESACTIVAR' : 'RENGLON_ACTIVAR', prov + ' | ' + cod, pub.success ? 'OK · publicado' : 'OK · sin publicar: ' + pub.error);
  return { success: true, filas: n, publicado: !!pub.success };
}

/* ------------------------------------------------------------------ */
/*  Tareas del menú ⚙ SÍGUELO (lista cerrada; nada fuera de aquí corre) */
/* ------------------------------------------------------------------ */

function admTarea_(d, u) {
  var t = String(d.tarea || '');
  var T = {
    precalentar: function () {
      if (typeof precalentarAhora !== 'function') throw new Error('precalentarAhora no está en el proyecto.');
      var r = precalentarAhora(); return 'Listo: ' + (r && r.ok) + ' de ' + (r && r.total) + ' consultas en caché.';
    },
    panel_json: function () {
      var r = panelPublicar_(true); if (!r.success) throw new Error(r.error);
      return 'Copia publicada (' + r.kb + ' KB · ' + r.activas + ' activas).';
    },
    senal: function () {
      if (typeof recalcularSenalUE !== 'function') throw new Error('recalcularSenalUE no está en el proyecto.');
      var r = recalcularSenalUE(); if (r && r.success === false) throw new Error(r.error);
      return 'Señales recalculadas' + (r && r.renglones ? ': ' + r.renglones + ' renglones.' : '.');
    },
    invalidar: function () {
      if (typeof bumpDataVersion_ !== 'function') throw new Error('bumpDataVersion_ no está en el proyecto.');
      bumpDataVersion_(); return 'Caché invalidada.';
    },
    saldos: function () {
      if (typeof publicarSaldosJSON !== 'function') throw new Error('publicarSaldosJSON no está en el proyecto.');
      var r = publicarSaldosJSON(); if (!r || !r.success) throw new Error((r && r.error) || 'No se pudo publicar.');
      return 'Saldos publicados: ' + r.total_renglones + ' renglones.';
    },
    entradas: function () {
      if (typeof entradasProgramarPublicacion_ !== 'function') throw new Error('La publicación de entradas no está en el proyecto.');
      var r = entradasProgramarPublicacion_(); if (!r || !r.ok) throw new Error((r && r.error) || 'No se pudo programar.');
      return { enCurso: true, mensaje: r.mensaje };
    },
    entradas_estado: function () {
      var r = entradasEstado_();
      if (r.estado === 'corriendo') return { enCurso: true };
      if (r.estado === 'listo') return 'Entradas publicadas: ' + r.filas + ' líneas · última recepción ' + r.corte + '.';
      if (r.estado === 'abortado') throw new Error('Publicación abortada: ' + r.error + ' (si el archivo es correcto, use "Publicar FORZANDO" del menú del libro).');
      throw new Error(r.error || 'Estado desconocido: ' + r.estado);
    },
    maestro: function () {
      var r = admPublicarMaestro_(); if (!r.success) throw new Error(r.error);
      return 'Catálogo publicado: ' + r.proveedores + ' proveedores · ' + r.renglones + ' renglones.';
    },
    notas_sim: function () {
      var r = procesarNotasDiferidas(true); return 'Diferidas sin nota: ' + ((r && r.sin_nota) || 0) + '. No se modificó nada.';
    },
    notas_apl: function () {
      var r = procesarNotasDiferidas(false); return 'Notas asignadas: ' + ((r && r.asignadas) || 0) + ' · PDF archivados: ' + ((r && r.archivadas) || 0) + '.';
    },
    notas_rearch: function () {
      var r = archivarPdfsNotasExistentes(); return 'PDF regenerados: ' + ((r && r.archivadas) || 0) + '.';
    },
    motor_sim: function () {
      var r = sincronizarMotorCalendario_core_(true); if (r && r.success === false) throw new Error(r.error);
      return 'Citas que se enviarían al Motor: ' + ((r && r.total) || 0) + '. No se modificó nada.';
    },
    motor_apl: function () {
      var r = sincronizarMotorCalendario_core_(false); if (!r || !r.success) throw new Error((r && r.error) || 'No se pudo sincronizar.');
      return 'Citas escritas en el Motor: ' + r.total + '.';
    },
    // Aviso semanal de cobertura a proveedores (AVISO_PROVEEDORES.gs)
    avp_resumen: function () {
      if (typeof avpResumen_ !== 'function') throw new Error('AVISO_PROVEEDORES.gs no está en el proyecto.');
      return avpResumen_().mensaje + ' · modo ' + (PropertiesService.getScriptProperties().getProperty('AVP_MODO') || 'PRUEBA') + '.';
    },
    avp_directorio: function () {
      if (typeof avpConstruirDirectorio_ !== 'function') throw new Error('AVISO_PROVEEDORES.gs no está en el proyecto.');
      var r = avpConstruirDirectorio_();
      return 'Directorio al día: ' + r.proveedoresNuevos + ' proveedores nuevos, ' + r.proveedoresCompletados + ' con correos completados, ' + r.planificadoresNuevos + ' planificadores nuevos · ' + r.correosSugeridos + ' correos de planificador sugeridos, ' + r.sinCorreo + ' sin correo (revise la columna NOTA).';
    },
    avp_prueba: function () {
      if (typeof avpProbar !== 'function') throw new Error('AVISO_PROVEEDORES.gs no está en el proyecto.');
      var r = avpProbar(); if (r.errores && r.errores.length) throw new Error(r.errores.join(' | '));
      return r.mensaje + '. Revise el correo de prueba.';
    },
    avp_hoy: function () {
      if (typeof avpEnviar_ !== 'function') throw new Error('AVISO_PROVEEDORES.gs no está en el proyecto.');
      var r = avpEnviar_({}); if (!r.success) throw new Error(r.errores.join(' | '));
      return r.mensaje + '.';
    }
  };
  if (!T.hasOwnProperty(t)) return { success: false, error: 'Tarea no reconocida.' };
  var t0 = Date.now();
  try {
    var r = T[t]();
    if (r && typeof r === 'object' && r.enCurso) {
      if (t !== 'entradas_estado') admBitacora_(u, 'TAREA ' + t, '', 'en curso');
      return { success: true, enCurso: true, mensaje: r.mensaje || '' };
    }
    var seg = Math.round((Date.now() - t0) / 1000);
    admBitacora_(u, 'TAREA ' + t, seg + ' s', r);
    return { success: true, mensaje: r };
  } catch (e) {
    var msg = String(e && e.message || e);
    admBitacora_(u, 'TAREA ' + t, '', 'ERROR ' + msg);
    return { success: false, error: msg };
  }
}

/* Disparadores programados del proyecto: el panel los muestra en la ayuda de cada tarea
   ("se ejecuta sola cada 15 min", "solo manual"). Solo lectura. */
function admDisparadores_() {
  var out = {};
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    out[f] = (out[f] || 0) + 1;
  });
  return { success: true, disparadores: out };
}

/* ------------------------------------------------------------------ */
/*  Copia rápida del panel (panel_confirmacion.json)                    */
/* ------------------------------------------------------------------ */

function panelMeses_() {
  var tz = Session.getScriptTimeZone(), hoy = new Date(), out = [];
  for (var k = -1; k <= 2; k++) out.push(Utilities.formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + k, 1), tz, 'yyyy-MM'));
  return out;
}

function panelConstruir_(meses) {
  var act = getSolicitudesPriorizadasCached(false, '');
  if (!act || !act.success) throw new Error('Lista activa: ' + ((act && act.error) || 'sin respuesta'));
  var listas = { activas: act.solicitudes || [] }, porMes = {};
  meses.forEach(function (m) {
    var r = getSolicitudesPriorizadasCached(true, m);
    if (r && r.success) porMes[m] = r.solicitudes || [];
  });
  var muestra = listas.activas[0];
  if (!muestra) Object.keys(porMes).forEach(function (m) { if (!muestra && porMes[m].length) muestra = porMes[m][0]; });
  var cols = muestra ? Object.keys(muestra).filter(function (c) { return PANEL_CAMPOS_PRIVADOS.indexOf(c) < 0; }) : [];
  var enc = function (L) { return L.map(function (s) { return cols.map(function (c) { return s[c] === undefined ? null : s[c]; }); }); };
  var out = { cols: cols, activas: enc(listas.activas), meses: {} };
  Object.keys(porMes).forEach(function (m) { out.meses[m] = enc(porMes[m]); });
  return out;
}

function panelPublicar_(forzar) {
  var props = PropertiesService.getScriptProperties(), token = props.getProperty('GH_TOKEN');
  if (!token) return { success: false, error: 'Falta GH_TOKEN en las propiedades del script.' };
  var meses = panelMeses_();
  var hoyTxt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  // Sin cambios en SIGUELO (misma versión de datos, mismos meses, mismo día): no se consulta nada.
  var clave = (typeof getDataVersion_ === 'function' ? getDataVersion_() : '') + '|' + meses.join(',') + '|' + hoyTxt;
  if (!forzar && props.getProperty(PANEL_PROP_CLAVE) === clave) return { success: true, sinCambios: true };
  var datos = panelConstruir_(meses);
  var cuerpo = JSON.stringify(datos);
  var huella = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cuerpo, Utilities.Charset.UTF_8));
  if (!forzar && props.getProperty(PANEL_PROP_HUELLA) === huella) { props.setProperty(PANEL_PROP_CLAVE, clave); return { success: true, sinCambios: true }; }
  datos._meta = { fuente: 'SIGUELO · getSolicitudesPriorizadas (lista activa y calendario). Sin datos de contacto.',
                  generado: Utilities.formatDate(new Date(), 'America/Panama', 'yyyy-MM-dd HH:mm') + ' PTY',
                  meses: meses, activas: datos.activas.length };
  var json = JSON.stringify(datos);
  var apiBase = 'https://api.github.com/repos/' + SALDOS_GH_OWNER + '/' + SALDOS_GH_REPO + '/contents/' + PANEL_GH_PATH;
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, sha = null;
  try {
    var g = UrlFetchApp.fetch(apiBase + '?ref=' + SALDOS_GH_BRANCH, { method: 'get', headers: headers, muteHttpExceptions: true });
    if (g.getResponseCode() === 200) sha = JSON.parse(g.getContentText()).sha;
  } catch (e) {}
  var payload = { message: 'Actualizar panel_confirmacion.json (' + datos._meta.generado + ')',
                  content: Utilities.base64Encode(json, Utilities.Charset.UTF_8), branch: SALDOS_GH_BRANCH };
  if (sha) payload.sha = sha;
  var p = UrlFetchApp.fetch(apiBase, { method: 'put', headers: headers, contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (p.getResponseCode() === 200 || p.getResponseCode() === 201) {
    props.setProperty(PANEL_PROP_HUELLA, huella); props.setProperty(PANEL_PROP_CLAVE, clave);
    return { success: true, kb: Math.round(json.length / 1024), activas: datos.activas.length, meses: meses };
  }
  return { success: false, error: 'GitHub respondió ' + p.getResponseCode() + ': ' + p.getContentText().slice(0, 300) };
}

/* Lo llama citasTrazDiferido_ cada 15 minutos. Nunca lanza. */
function panelDiferido_() {
  try {
    var r = panelPublicar_(false);
    if (r && r.success && !r.sinCambios) Logger.log('panel_confirmacion.json publicado: ' + r.kb + ' KB · ' + r.activas + ' activas.');
    if (r && !r.success) Logger.log('panelDiferido_: ' + r.error);
  } catch (e) { Logger.log('panelDiferido_ ERROR: ' + e); }
}

/* Ejecutar una vez desde el editor (autoriza y hace la primera publicación). */
function panelPublicarAhora() {
  var t0 = Date.now(), r = panelPublicar_(true);
  Logger.log(r.success ? ('panel_confirmacion.json publicado: ' + r.kb + ' KB · ' + r.activas + ' activas · meses ' + r.meses.join(', ') + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s')
                       : ('No publicado: ' + r.error));
  return r;
}

/* Prueba de lectura del maestro y del acceso, sin escribir nada. */
function admProbar() {
  var m = admMaestro_();
  var prov = {}; m.filas.forEach(function (f) { prov[f.p] = 1; });
  Logger.log('MAESTRO_PROVEEDORES: ' + m.total + ' renglones · ' + Object.keys(prov).length + ' proveedores · inactivos: ' +
             m.filas.filter(function (f) { return f.a === 'NO'; }).length);
  Logger.log('Roles con acceso a Administración: ' + ADM_ROLES.join(', '));
  ['precalentarAhora', 'recalcularSenalUE', 'bumpDataVersion_', 'publicarSaldosJSON', 'entradasProgramarPublicacion_',
   'procesarNotasDiferidas', 'archivarPdfsNotasExistentes', 'sincronizarMotorCalendario_core_', 'maestroPublicarGitHub_', 'invalidarCacheMaestro']
    .forEach(function (n) { Logger.log((typeof globalThis[n] === 'function' ? 'OK    ' : 'FALTA ') + n); });
}
