/**
 * ============================================================================
 *  TRAZABILIDAD DOCUMENTAL DE LA RECEPCIÓN (RB) · registro de hitos por PIN
 *  Diego Bethancourth · Torre de Control · DINALOG · CSS
 *  Proyecto: SIGUELO (libro BASE DE DATOS DE CITAS) · cuenta pedregaljuandiaz
 * ----------------------------------------------------------------------------
 *  Archivo NUEVO dentro del mismo proyecto de Apps Script. No modifica ninguna
 *  función existente. Solo requiere dos líneas de enganche (ver INSTALACIÓN).
 *
 *  Hojas que crea (trzInstalar):
 *    TRZ_USUARIOS  PIN | NOMBRE | AREA | ROL | ACTIVO | CORREO | NOTA
 *    TRZ_EVENTOS   bitácora inmutable de hitos (nunca se borra; se anula)
 *    TRZ_ACCESOS   auditoría de ingresos por PIN (aciertos y fallos)
 *
 *  Reglas que el servidor hace cumplir (no dependen del navegador):
 *    1. El usuario sale del PIN, no se escribe a mano.
 *    2. Cada área solo registra sus pasos (SUPERVISOR registra cualquiera).
 *    3. No se saltan pasos: solo se registra el paso que toca.
 *    4. DEVUELVE exige destino anterior y motivo; reabre desde el destino.
 *    5. Evidencia obligatoria: se guarda en Drive y se enlaza al evento.
 *    6. Fecha del hito: no futura, no anterior a la recepción ni al hito previo.
 *    7. Doble envío por mala señal: el mismo ID_CLIENTE no se graba dos veces.
 *    8. Nada se borra: un supervisor puede ANULAR con motivo.
 *
 *  INSTALACIÓN (una sola vez):
 *    a) En doGet, junto a los enganches de iepsRuta_ / kdxRuta_, agregar:
 *         if (typeof trzRuta_ === 'function'){
 *           var _trz = trzRuta_(e);
 *           if (_trz) return createOutput_(_trz, callback);
 *         }
 *    b) En doPostInterno_, inmediatamente después de
 *         var action = String(payload.action || '');
 *       agregar:
 *         if (typeof trzPost_ === 'function'){
 *           var _trzp = trzPost_(payload);
 *           if (_trzp) return createOutput_(_trzp, '');
 *         }
 *    c) Ejecutar trzInstalar() una vez desde el editor y cargar los PIN.
 *    d) Implementar > Gestionar implementaciones > editar > Nueva versión
 *       (misma URL /exec; no cambia el enlace de los paneles).
 *
 *  REVERSIÓN: borrar las dos líneas de enganche y este archivo. Las hojas
 *  TRZ_* quedan como respaldo y no afectan a SIGUELO.
 *
 *  PRUEBA: ejecutar trzPrueba() desde el editor. Crea un PIN temporal, prueba
 *  salto de paso, registro, doble envío y anulación sobre el expediente
 *  ficticio RB-PRUEBA-20260101, y borra el PIN al terminar. En TRZ_EVENTOS
 *  queda esa fila marcada ANULADO (la bitácora nunca se borra).
 * ============================================================================
 */

var TRZ_HOJA_USUARIOS = 'TRZ_USUARIOS';
var TRZ_HOJA_EVENTOS  = 'TRZ_EVENTOS';
var TRZ_HOJA_ACCESOS  = 'TRZ_ACCESOS';
var TRZ_CARPETA_NOMBRE = 'Trazabilidad RB';
var TRZ_MAX_BYTES = 8 * 1024 * 1024;
var TRZ_MAX_FALLOS = 15;          // fallos de PIN tolerados por ventana
var TRZ_VENTANA_FALLOS = 600;     // segundos (10 min)

/* Los 14 pasos de la Matriz Operativa + el tramo de Contabilidad (C·12→13),
   en el mismo orden que el tablero. No se agregan ni quitan pasos. */
var TRZ_PASOS = [
  ['P01', 'Coordinador',       'Recibe el expediente'],
  ['P02', 'Control1',          'Distribuye a Cómputo y solicita factura'],
  ['P03', 'DINALOG',           'Entrega la factura'],
  ['P04', 'Cómputo',           'Confecciona el informe'],
  ['P05', 'Control1',          'Integra el expediente'],
  ['P06', 'Control2',          'Canaliza a firma'],
  ['P07', 'Ventanilla Única',  'Revisa y firma'],
  ['P08', 'Control2',          'Completa el expediente'],
  ['P09', 'Control3',          'Firma cuenta y hoja remisoria'],
  ['P10', 'Control2',          'Distribuye documentación'],
  ['P11', 'Archivo',           'Archiva'],
  ['P12', 'Coordinador',       'Envía el original a Contabilidad'],
  ['C12', 'Contabilidad',      'Recibe y devuelve (tramo C·12→13)'],
  ['P13', 'Coordinador',       'Reingresa y remite a Compras'],
  ['P14', 'Equipo de Compras', 'Publica']
];

var TRZ_COLS_EVENTOS = ['TS_SERVIDOR', 'ID_EVENTO', 'ID_CLIENTE', 'EXPEDIENTE', 'OC', 'RENGLON', 'PROVEEDOR',
  'PASO', 'RESULTADO', 'DESTINO', 'MOTIVO', 'FECHA_HITO', 'USUARIO', 'AREA', 'OBSERVACION',
  'EVIDENCIA_URL', 'EVIDENCIA_NOMBRE', 'ESTADO', 'ANULADO_POR', 'ANULADO_TS', 'ANULADO_MOTIVO'];

/* ------------------------------------------------------------------ */
/*  Enrutadores (devuelven null si la acción no es de este módulo)      */
/* ------------------------------------------------------------------ */

function trzRuta_(e) {
  var p = (e && e.parameter) || {};
  var a = String(p.action || '');
  if (a === 'trzEventos') return trzEventos_(String(p.exp || ''));
  if (a === 'trzResumen') return trzResumen_();
  if (a === 'trzPasos')   return { success: true, pasos: TRZ_PASOS };
  return null;
}

function trzPost_(payload) {
  var a = String((payload && payload.action) || '');
  if (a.indexOf('trz') !== 0) return null;
  try {
    var d = payload.data || {};
    if (a === 'trzLogin')     return trzLogin_(d);
    if (a === 'trzRegistrar') return trzRegistrar_(d);
    if (a === 'trzAnular')    return trzAnular_(d);
    return { success: false, error: 'Acción de trazabilidad no reconocida.' };
  } catch (err) {
    return { success: false, error: 'Error interno: ' + String(err && err.message || err) };
  }
}

/* ------------------------------------------------------------------ */
/*  Usuarios y PIN                                                      */
/* ------------------------------------------------------------------ */

function trzHoja_(nombre, encabezados) {
  // El libro de citas es pesado: Sheets a veces responde "timed out".
  // Reintenta hasta 4 veces con espera creciente antes de rendirse.
  var ultimoError = null;
  for (var intento = 1; intento <= 4; intento++) {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sh = ss.getSheetByName(nombre);
      if (!sh) sh = ss.insertSheet(nombre, ss.getNumSheets());
      // Si la hoja quedó creada sin encabezados (p. ej. tras un timeout), se completan.
      if (sh.getLastColumn() === 0 || String(sh.getRange(1, 1).getValue()).trim() === '') {
        sh.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
        sh.setFrozenRows(1);
        SpreadsheetApp.flush();
      }
      return sh;
    } catch (e) {
      ultimoError = e;
      Logger.log('trzHoja_(' + nombre + ') intento ' + intento + ' falló: ' + e);
      Utilities.sleep(2000 * intento);
    }
  }
  throw ultimoError;
}

function trzIdx_(hdr) {
  var m = {};
  for (var i = 0; i < hdr.length; i++) m[String(hdr[i] || '').trim().toUpperCase()] = i;
  return m;
}

function trzBuscarUsuario_(pin) {
  pin = String(pin || '').trim();
  if (!/^\d{4,6}$/.test(pin)) return null;
  var sh = trzHoja_(TRZ_HOJA_USUARIOS, ['PIN', 'NOMBRE', 'AREA', 'ROL', 'ACTIVO', 'CORREO', 'NOTA']);
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return null;
  var c = trzIdx_(v[0]);
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][c.PIN]).trim() !== pin) continue;
    var activo = String(v[i][c.ACTIVO] || 'SI').trim().toUpperCase();
    if (activo === 'NO') return { inactivo: true };
    return {
      nombre: String(v[i][c.NOMBRE] || '').trim(),
      area: String(v[i][c.AREA] || '').trim(),
      rol: String(v[i][c.ROL] || 'OPERADOR').trim().toUpperCase()
    };
  }
  return null;
}

function trzPasosDeArea_(area, rol) {
  if (rol === 'SUPERVISOR') return TRZ_PASOS.map(function (p) { return p[0]; });
  var a = trzNorm_(area);
  return TRZ_PASOS.filter(function (p) { return trzNorm_(p[1]) === a; }).map(function (p) { return p[0]; });
}

function trzNorm_(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
}

function trzAuditar_(pin, resultado, usuario) {
  try {
    var sh = trzHoja_(TRZ_HOJA_ACCESOS, ['TS', 'PIN_TERMINA_EN', 'RESULTADO', 'USUARIO']);
    sh.appendRow([new Date(), '…' + String(pin || '').slice(-2), resultado, usuario || '']);
  } catch (e) {}
}

/* Freno simple contra adivinar PINs: muchos fallos seguidos bloquean 10 min. */
function trzFrenoFallos_(sumar) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('trz_fallos') || 0);
  if (sumar) { n++; cache.put('trz_fallos', String(n), TRZ_VENTANA_FALLOS); }
  return n >= TRZ_MAX_FALLOS;
}

function trzAutenticar_(pin) {
  if (trzFrenoFallos_(false)) return { error: 'Demasiados intentos fallidos. Espere 10 minutos.' };
  var u = trzBuscarUsuario_(pin);
  if (!u) { trzFrenoFallos_(true); trzAuditar_(pin, 'PIN_INVALIDO', ''); return { error: 'PIN incorrecto.' }; }
  if (u.inactivo) { trzAuditar_(pin, 'INACTIVO', ''); return { error: 'Usuario inactivo. Consulte a la Torre de Control.' }; }
  if (!u.nombre || !u.area) return { error: 'El usuario no tiene nombre o área cargados en TRZ_USUARIOS.' };
  return { usuario: u };
}

function trzLogin_(d) {
  var r = trzAutenticar_(d.pin);
  if (r.error) return { success: false, error: r.error };
  trzAuditar_(d.pin, 'INGRESO', r.usuario.nombre);
  return {
    success: true,
    nombre: r.usuario.nombre,
    area: r.usuario.area,
    rol: r.usuario.rol,
    pasos: trzPasosDeArea_(r.usuario.area, r.usuario.rol)
  };
}

/* ------------------------------------------------------------------ */
/*  Bitácora de eventos                                                 */
/* ------------------------------------------------------------------ */

function trzLeerEventos_(exp) {
  var sh = trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS);
  var v = sh.getDataRange().getValues();
  var c = trzIdx_(v[0]);
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (exp && String(v[i][c.EXPEDIENTE]) !== exp) continue;
    out.push({
      fila: i + 1,
      id: String(v[i][c.ID_EVENTO]),
      idCliente: String(v[i][c.ID_CLIENTE] || ''),
      exp: String(v[i][c.EXPEDIENTE]),
      paso: String(v[i][c.PASO]),
      tipo: String(v[i][c.RESULTADO]),
      dest: String(v[i][c.DESTINO] || '') || null,
      motivo: String(v[i][c.MOTIVO] || '') || null,
      ts: trzFmt_(v[i][c.FECHA_HITO]),
      tsServidor: trzFmt_(v[i][c.TS_SERVIDOR]),
      quien: String(v[i][c.USUARIO] || ''),
      area: String(v[i][c.AREA] || ''),
      obs: String(v[i][c.OBSERVACION] || ''),
      evidUrl: String(v[i][c.EVIDENCIA_URL] || ''),
      evid: String(v[i][c.EVIDENCIA_NOMBRE] || ''),
      estado: String(v[i][c.ESTADO] || 'VIGENTE'),
      anuladoPor: String(v[i][c.ANULADO_POR] || ''),
      anuladoMotivo: String(v[i][c.ANULADO_MOTIVO] || '')
    });
  }
  return out;
}

function trzFmt_(d) {
  if (!(d instanceof Date)) return String(d || '');
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
}

/* Reproduce la bitácora: TRANSFIERE suma el paso; DEVUELVE reabre desde el
   destino. Devuelve los pasos hechos y el paso que toca. */
function trzEstado_(eventos) {
  var orden = TRZ_PASOS.map(function (p) { return p[0]; });
  var hechos = {};
  var ultimo = null;
  eventos.forEach(function (ev) {
    if (ev.estado === 'ANULADO') return;
    if (ev.tipo === 'TRANSFIERE') hechos[ev.paso] = ev.ts || true;
    if (ev.tipo === 'DEVUELVE') {
      var k = orden.indexOf(ev.dest);
      for (var j = k; j < orden.length; j++) delete hechos[orden[j]];
    }
    ultimo = ev;
  });
  var sig = null;
  for (var i = 0; i < orden.length; i++) if (!hechos[orden[i]]) { sig = orden[i]; break; }
  return { hechos: hechos, siguiente: sig, ultimo: ultimo, completos: Object.keys(hechos).length };
}

function trzEventos_(exp) {
  if (!exp) return { success: false, error: 'Falta el expediente.' };
  var ev = trzLeerEventos_(exp).map(function (x) { delete x.fila; return x; });
  var st = trzEstado_(ev);
  return { success: true, exp: exp, eventos: ev, siguiente: st.siguiente, completos: st.completos };
}

/* Resumen liviano para tablas y vista del proveedor: sin nombres de personas. */
function trzResumen_() {
  var ev = trzLeerEventos_('');
  var por = {};
  ev.forEach(function (x) { (por[x.exp] = por[x.exp] || []).push(x); });
  var out = {};
  Object.keys(por).forEach(function (k) {
    var st = trzEstado_(por[k]);
    out[k] = {
      siguiente: st.siguiente,
      completos: st.completos,
      ultimoPaso: st.ultimo ? st.ultimo.paso : null,
      ultimoTipo: st.ultimo ? st.ultimo.tipo : null,
      ultimoTs: st.ultimo ? st.ultimo.ts : null,
      // hitos que ve el proveedor: firma del informe (P11), Contabilidad (C12), publicación (P14)
      hitos: { P11: st.hechos.P11 || null, C12: st.hechos.C12 || null, P14: st.hechos.P14 || null }
    };
  });
  return { success: true, generado: trzFmt_(new Date()), expedientes: out };
}

/* ------------------------------------------------------------------ */
/*  Registrar un hito                                                   */
/* ------------------------------------------------------------------ */

function trzRegistrar_(d) {
  var auth = trzAutenticar_(d.pin);
  if (auth.error) return { success: false, error: auth.error };
  var u = auth.usuario;

  var exp = String(d.exp || '').trim();
  var m = /^RB-[A-Za-z0-9_.\/-]+-(\d{4})(\d{2})(\d{2})$/.exec(exp);
  if (!m) return { success: false, error: 'Identificador de expediente no válido.' };
  var fRec = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  var orden = TRZ_PASOS.map(function (p) { return p[0]; });
  var paso = String(d.paso || '');
  var iPaso = orden.indexOf(paso);
  if (iPaso < 0) return { success: false, error: 'Paso no reconocido.' };

  var tipo = String(d.tipo || '');
  if (tipo !== 'TRANSFIERE' && tipo !== 'DEVUELVE') return { success: false, error: 'Resultado no válido.' };

  if (trzPasosDeArea_(u.area, u.rol).indexOf(paso) < 0) {
    return { success: false, error: 'El paso ' + paso + ' le corresponde a ' + TRZ_PASOS[iPaso][1] + '; su usuario es de ' + u.area + '.' };
  }

  var dest = null, motivo = null;
  if (tipo === 'DEVUELVE') {
    dest = String(d.dest || '');
    var iDest = orden.indexOf(dest);
    if (iDest < 0 || iDest >= iPaso) return { success: false, error: 'La devolución debe ir a un paso anterior.' };
    motivo = String(d.motivo || '').trim();
    if (!motivo) return { success: false, error: 'Indique el motivo de la devolución.' };
  }

  var fh = trzParseFecha_(d.ts);
  if (!fh) return { success: false, error: 'Fecha y hora del hito no válidas.' };
  if (fh.getTime() > Date.now() + 10 * 60 * 1000) return { success: false, error: 'La fecha del hito no puede ser futura.' };
  if (fh.getTime() < fRec.getTime()) return { success: false, error: 'La fecha del hito es anterior a la recepción.' };

  if (!d.evidencia || !d.evidencia.base64) return { success: false, error: 'Adjunte la evidencia: sin ella el hito no se registra.' };
  var bytes = Utilities.base64Decode(String(d.evidencia.base64));
  if (bytes.length > TRZ_MAX_BYTES) return { success: false, error: 'La evidencia supera 8 MB.' };
  var mime = String(d.evidencia.mime || 'application/octet-stream');
  if (!/^image\/|^application\/pdf$/.test(mime)) return { success: false, error: 'La evidencia debe ser foto o PDF.' };

  var idCliente = String(d.idCliente || '').slice(0, 64);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { success: false, error: 'El sistema está ocupado; reintente en unos segundos.' };
  try {
    var previos = trzLeerEventos_(exp);

    // 7. Doble envío: mismo ID_CLIENTE → se devuelve el registro existente.
    if (idCliente) {
      for (var k = 0; k < previos.length; k++) {
        if (previos[k].idCliente === idCliente) {
          return { success: true, duplicado: true, id: previos[k].id, mensaje: 'Este hito ya estaba registrado.' };
        }
      }
    }

    var st = trzEstado_(previos);
    if (st.siguiente !== paso) {
      return { success: false, error: st.siguiente
        ? ('Ahora le toca el paso ' + st.siguiente + ' (' + TRZ_PASOS[orden.indexOf(st.siguiente)][1] + '). No se pueden saltar pasos.')
        : 'El expediente ya completó todos los pasos.' };
    }
    if (st.ultimo) {
      var fu = trzParseFecha_(st.ultimo.ts);
      if (fu && fh.getTime() < fu.getTime()) return { success: false, error: 'La fecha es anterior al último hito registrado (' + st.ultimo.ts.replace('T', ' ') + ').' };
    }

    // 5. Evidencia a Drive: Sustento / Trazabilidad RB / AAAA-MM / expediente
    var cTrz = trzCarpetaRaiz_();
    var cMes = getOrCreateSubfolder_(cTrz, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'));
    var cExp = getOrCreateSubfolder_(cMes, exp.replace(/[\/\\:*?"<>|]/g, '-'));
    var ext = (typeof inferirExtension_ === 'function') ? inferirExtension_(String(d.evidencia.nombre || ''), mime) : (mime.indexOf('pdf') >= 0 ? '.pdf' : '.jpg');
    var nombre = exp + '_' + paso + '_' + tipo + '_' + Utilities.formatDate(fh, Session.getScriptTimeZone(), 'yyyyMMdd-HHmm') + ext;
    var archivo = cExp.createFile(Utilities.newBlob(bytes, mime, nombre));

    var idEv = 'EV-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);
    var sh = trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS);
    var fila = {};
    fila.TS_SERVIDOR = new Date(); fila.ID_EVENTO = idEv; fila.ID_CLIENTE = idCliente; fila.EXPEDIENTE = exp;
    fila.OC = String(d.oc || ''); fila.RENGLON = String(d.renglon || ''); fila.PROVEEDOR = String(d.proveedor || '');
    fila.PASO = paso; fila.RESULTADO = tipo; fila.DESTINO = dest || ''; fila.MOTIVO = motivo || '';
    fila.FECHA_HITO = fh; fila.USUARIO = u.nombre; fila.AREA = u.area;
    fila.OBSERVACION = String(d.obs || '').slice(0, 500);
    fila.EVIDENCIA_URL = archivo.getUrl(); fila.EVIDENCIA_NOMBRE = nombre; fila.ESTADO = 'VIGENTE';
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    sh.appendRow(hdr.map(function (h) { var x = fila[String(h).trim().toUpperCase()]; return x == null ? '' : x; }));

    var ev2 = trzLeerEventos_(exp);
    var st2 = trzEstado_(ev2);
    return { success: true, id: idEv, evidUrl: archivo.getUrl(), siguiente: st2.siguiente, completos: st2.completos,
      mensaje: tipo === 'DEVUELVE' ? ('Devuelto a ' + dest + '.') : ('Paso ' + paso + ' registrado.') };
  } finally {
    lock.releaseLock();
  }
}

/* Carpeta raíz de evidencias. Orden: 1) la guardada en Propiedades del
   script (TRZ_CARPETA_ID); 2) subcarpeta dentro de la carpeta de sustento
   de SIGUELO, si esta cuenta tiene acceso; 3) una carpeta propia en "Mi
   unidad" de la cuenta del script. La que funcione se guarda y se reutiliza. */
function trzCarpetaRaiz_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('TRZ_CARPETA_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { Logger.log('TRZ_CARPETA_ID inválido: ' + e); } }
  var carpeta = null;
  try {
    if (typeof CARPETA_SUSTENTO_ID !== 'undefined' && CARPETA_SUSTENTO_ID) {
      carpeta = getOrCreateSubfolder_(DriveApp.getFolderById(CARPETA_SUSTENTO_ID), TRZ_CARPETA_NOMBRE);
    }
  } catch (e) {
    Logger.log('Sin acceso a CARPETA_SUSTENTO_ID desde esta cuenta; se usa carpeta propia. ' + e);
  }
  if (!carpeta) {
    var it = DriveApp.getRootFolder().getFoldersByName(TRZ_CARPETA_NOMBRE + ' · Evidencias');
    carpeta = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(TRZ_CARPETA_NOMBRE + ' · Evidencias');
  }
  props.setProperty('TRZ_CARPETA_ID', carpeta.getId());
  Logger.log('Carpeta de evidencias: ' + carpeta.getName() + ' · ' + carpeta.getUrl());
  return carpeta;
}

function trzParseFecha_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

/* ------------------------------------------------------------------ */
/*  Anular (solo SUPERVISOR): el evento queda, marcado ANULADO          */
/* ------------------------------------------------------------------ */

function trzAnular_(d) {
  var auth = trzAutenticar_(d.pin);
  if (auth.error) return { success: false, error: auth.error };
  if (auth.usuario.rol !== 'SUPERVISOR') return { success: false, error: 'Solo un supervisor puede anular un hito.' };
  var motivo = String(d.motivo || '').trim();
  if (!motivo) return { success: false, error: 'Indique el motivo de la anulación.' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { success: false, error: 'El sistema está ocupado; reintente.' };
  try {
    var sh = trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS);
    var v = sh.getDataRange().getValues();
    var c = trzIdx_(v[0]);
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][c.ID_EVENTO]) !== String(d.id || '')) continue;
      if (String(v[i][c.ESTADO]) === 'ANULADO') return { success: false, error: 'Ese hito ya estaba anulado.' };
      sh.getRange(i + 1, c.ESTADO + 1).setValue('ANULADO');
      sh.getRange(i + 1, c.ANULADO_POR + 1).setValue(auth.usuario.nombre);
      sh.getRange(i + 1, c.ANULADO_TS + 1).setValue(new Date());
      sh.getRange(i + 1, c.ANULADO_MOTIVO + 1).setValue(motivo.slice(0, 300));
      return { success: true, mensaje: 'Hito anulado. Queda en la bitácora como ANULADO.' };
    }
    return { success: false, error: 'No se encontró el hito.' };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/*  Instalación y prueba (ejecutar desde el editor)                     */
/* ------------------------------------------------------------------ */

function trzInstalar() {
  var su = trzHoja_(TRZ_HOJA_USUARIOS, ['PIN', 'NOMBRE', 'AREA', 'ROL', 'ACTIVO', 'CORREO', 'NOTA']);
  trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS);
  trzHoja_(TRZ_HOJA_ACCESOS, ['TS', 'PIN_TERMINA_EN', 'RESULTADO', 'USUARIO']);

  // Listas desplegables en AREA, ROL y ACTIVO; PIN como texto (conserva ceros).
  var areas = [];
  TRZ_PASOS.forEach(function (p) { if (areas.indexOf(p[1]) < 0) areas.push(p[1]); });
  su.getRange('A2:A300').setNumberFormat('@');
  su.getRange('C2:C300').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(areas, true).build());
  su.getRange('D2:D300').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['OPERADOR', 'SUPERVISOR'], true).build());
  su.getRange('E2:E300').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).build());
  SpreadsheetApp.flush();

  // Protección: solo el dueño del libro edita usuarios y bitácora.
  [TRZ_HOJA_USUARIOS, TRZ_HOJA_EVENTOS, TRZ_HOJA_ACCESOS].forEach(function (n) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n);
    if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return; // ya protegida (re-ejecución)
    var pr = sh.protect().setDescription('Trazabilidad RB · solo script y Torre de Control');
    pr.removeEditors(pr.getEditors());
    if (pr.canDomainEdit()) pr.setDomainEdit(false);
  });
  Logger.log('Listo. Áreas válidas: ' + areas.join(' | '));
}

function trzPrueba() {
  var su = trzHoja_(TRZ_HOJA_USUARIOS, ['PIN', 'NOMBRE', 'AREA', 'ROL', 'ACTIVO', 'CORREO', 'NOTA']);
  su.appendRow(['909090', 'PRUEBA SUPERVISOR', 'Coordinador', 'SUPERVISOR', 'SI', '', 'PRUEBA · borrar']);
  var filaUsr = su.getLastRow();
  var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  var exp = 'RB-PRUEBA-20260101';
  try {
    var l = trzLogin_({ pin: '909090' });
    Logger.log('login: ' + JSON.stringify(l));
    var r1 = trzRegistrar_({ pin: '909090', exp: exp, paso: 'P02', tipo: 'TRANSFIERE', ts: '2026-01-02T08:00',
      evidencia: { base64: png, mime: 'image/png', nombre: 'p.png' } });
    Logger.log('saltar paso (debe fallar): ' + JSON.stringify(r1));
    var r2 = trzRegistrar_({ pin: '909090', exp: exp, paso: 'P01', tipo: 'TRANSFIERE', ts: '2026-01-02T08:00', idCliente: 'prueba-1',
      evidencia: { base64: png, mime: 'image/png', nombre: 'p.png' } });
    Logger.log('P01: ' + JSON.stringify(r2));
    var r3 = trzRegistrar_({ pin: '909090', exp: exp, paso: 'P01', tipo: 'TRANSFIERE', ts: '2026-01-02T08:00', idCliente: 'prueba-1',
      evidencia: { base64: png, mime: 'image/png', nombre: 'p.png' } });
    Logger.log('doble envío (debe decir duplicado): ' + JSON.stringify(r3));
    Logger.log('eventos: ' + JSON.stringify(trzEventos_(exp)));
    if (r2.success) Logger.log('anular: ' + JSON.stringify(trzAnular_({ pin: '909090', id: r2.id, motivo: 'PRUEBA' })));
  } finally {
    su.deleteRow(filaUsr);
  }
}

/* ------------------------------------------------------------------ */
/*  Publicación de la bitácora a GitHub Pages (lectura instantánea)     */
/* ------------------------------------------------------------------ */
/* El tablero lee primero trazabilidad_eventos.json (rápido, desde Pages)
   y después confirma contra SIGUELO en segundo plano. Se publica solo si
   cambió (huella MD5). Lo llama citasTrazDiferido_ cada 15 minutos y
   trzRegistrar_/trzAnular_ marcan la bitácora como cambiada. */
var TRZ_GH_PATH = 'trazabilidad_eventos.json';
var TRZ_PROP_HASH = 'TRZ_HUELLA';

function trzPublicar_(forzar) {
  var props = PropertiesService.getScriptProperties(), token = props.getProperty('GH_TOKEN');
  if (!token) return { success: false, error: 'Falta GH_TOKEN en las propiedades del script.' };
  var ev = trzLeerEventos_('').map(function (x) { delete x.fila; delete x.idCliente; return x; });
  var cuerpo = JSON.stringify(ev);
  var huella = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cuerpo, Utilities.Charset.UTF_8));
  if (!forzar && props.getProperty(TRZ_PROP_HASH) === huella) return { success: true, sinCambios: true, filas: ev.length };
  var obj = { _meta: { fuente: 'TRZ_EVENTOS (bitácora de hitos documentales · SIGUELO)', filas: ev.length,
    generado: Utilities.formatDate(new Date(), 'America/Panama', 'yyyy-MM-dd HH:mm') + ' PTY' }, eventos: ev };
  var apiBase = 'https://api.github.com/repos/' + SALDOS_GH_OWNER + '/' + SALDOS_GH_REPO + '/contents/' + TRZ_GH_PATH;
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, sha = null;
  try {
    var g = UrlFetchApp.fetch(apiBase + '?ref=' + SALDOS_GH_BRANCH, { method: 'get', headers: headers, muteHttpExceptions: true });
    if (g.getResponseCode() === 200) sha = JSON.parse(g.getContentText()).sha;
  } catch (e) {}
  var payload = { message: 'Actualizar trazabilidad_eventos.json (' + obj._meta.generado + ')',
    content: Utilities.base64Encode(JSON.stringify(obj), Utilities.Charset.UTF_8), branch: SALDOS_GH_BRANCH };
  if (sha) payload.sha = sha;
  var p = UrlFetchApp.fetch(apiBase, { method: 'put', headers: headers, contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (p.getResponseCode() === 200 || p.getResponseCode() === 201) { props.setProperty(TRZ_PROP_HASH, huella); return { success: true, filas: ev.length }; }
  return { success: false, error: 'GitHub respondió ' + p.getResponseCode() + ': ' + p.getContentText().slice(0, 300) };
}

/* Nunca lanza. */
function trzDiferido_() {
  try {
    var r = trzPublicar_(false);
    if (r && r.success && !r.sinCambios) Logger.log('trazabilidad_eventos.json publicado: ' + r.filas + ' eventos.');
    if (r && !r.success) Logger.log('trzDiferido_: ' + r.error);
  } catch (e) { Logger.log('trzDiferido_ ERROR: ' + e); }
}

/* Ejecutar una vez desde el editor para la primera publicación. */
function trzPublicarAhora() {
  var r = trzPublicar_(true);
  Logger.log(r.success ? ('trazabilidad_eventos.json publicado: ' + r.filas + ' eventos.') : ('No publicado: ' + r.error));
  return r;
}
