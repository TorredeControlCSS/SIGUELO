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
 *    TRZ_PERSONAS  NOMBRE | AREA | ACTIVO | ALTA_POR | ALTA_TS | NOTA
 *                  lista desplegable «Quién lo hizo» (se crea sola con el
 *                  equipo de Control Operativo; las personas nuevas entran
 *                  como PENDIENTE hasta que la jefatura las reconoce: SI)
 *
 *  Cambios 13-nov-2026 (pedido de la Jefatura de Control Operativo):
 *    · «Quién lo hizo» se elige de una lista por área, con opción de agregar
 *      a alguien nuevo. Quien ingresa con el PIN queda como «registró».
 *    · Resultado PARCIAL (adelantos o expediente incompleto): queda marcado
 *      y el expediente NO avanza hasta registrar el paso como completado.
 *    · La evidencia pasa a ser OPCIONAL (si se adjunta, va a Drive).
 *    · ROL REGISTRADOR: registra cualquier paso (p. ej. la coordinadora que
 *      lleva el control del grupo) pero no anula ni da altas manuales.
 *
 *  Empalme con el cuadro de Control Operativo (13-nov-2026):
 *    · trzImportarEmpalme() lee trazabilidad_empalme.json (generado desde el
 *      Excel CONSOLIDADO del departamento) y escribe en TRZ_EVENTOS un evento
 *      RESULTADO = EMPALME por cada hito que el cuadro ya tenía: «hasta este
 *      paso el expediente ya estaba hecho». Se puede repetir sin duplicar.
 *      Para deshacerlo: trzAnularEmpalme() los marca ANULADO (no borra nada).
 *      También escribe la hoja TRZ_CUADRO_CONTROL: el cuadro completo, cada
 *      fila con su resultado (EMPALMADO / ANTERIOR AL TABLERO / SIN PAREJA).
 *    · Lectura rápida: el tablero lee trazabilidad_eventos.json en Pages; el
 *      GAS solo atiende escrituras. Cada registro agenda una publicación a los
 *      45 s (trzDisparoUnico), además de la de cada 15 min (citasTrazDiferido_).
 *
 *  Reglas que el servidor hace cumplir (no dependen del navegador):
 *    1. Quién registra sale del PIN; quién lo hizo, de TRZ_PERSONAS.
 *    2. Cada área solo registra sus pasos (SUPERVISOR y REGISTRADOR, cualquiera).
 *    3. No se saltan pasos: solo se registra el paso que toca.
 *    4. DEVUELVE exige destino anterior y motivo; reabre desde el destino.
 *    5. Evidencia opcional: si se adjunta, se guarda en Drive y se enlaza.
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
var TRZ_HOJA_PERSONAS = 'TRZ_PERSONAS';
var TRZ_COLS_PERSONAS = ['NOMBRE', 'AREA', 'ACTIVO', 'ALTA_POR', 'ALTA_TS', 'NOTA'];
/* Equipo que opera la plataforma (lista enviada por la Jefatura de Control
   Operativo, 13-nov-2026). Solo se usa para crear TRZ_PERSONAS la primera
   vez; después la fuente es la hoja. */
var TRZ_PERSONAS_INICIALES = [
  ['Mónica Quintero',    'Coordinador',      'SI', 'REGISTRADOR'],
  ['Raymundo Quiel',     'Control1',         'SI', 'OPERADOR'],
  ['Pablo Castrejón',    'Control2',         'SI', 'OPERADOR'],
  ['Olaydis Pérez',      'Ventanilla Única', 'SI', 'OPERADOR'],
  ['Velkis Soto',        'Contabilidad',     'SI', 'OPERADOR'],
  ['Evika Llung Guenn',  'Archivo',          'SI', 'OPERADOR'],
  ['Landecho',           'Control2',         'NO', '']   // histórico: aparece en el cuadro, ya no participa
];
var TRZ_URL_EMPALME = 'https://torrecontrolcss.org/SIGUELO/trazabilidad_empalme.json';
var TRZ_USUARIO_EMPALME = 'Cuadro de Control Operativo (empalme 13-nov-2026)';
var TRZ_ROLES = ['OPERADOR', 'REGISTRADOR', 'SUPERVISOR'];
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
  'EVIDENCIA_URL', 'EVIDENCIA_NOMBRE', 'ESTADO', 'ANULADO_POR', 'ANULADO_TS', 'ANULADO_MOTIVO', 'EJECUTOR'];

/* ------------------------------------------------------------------ */
/*  Enrutadores (devuelven null si la acción no es de este módulo)      */
/* ------------------------------------------------------------------ */

function trzRuta_(e) {
  if (typeof incRuta_ === 'function') { var _inc = incRuta_(e); if (_inc) return _inc; }   // Expediente de Incumplimiento (INCUMPLIMIENTOS_TRZ.gs)
  var p = (e && e.parameter) || {};
  var a = String(p.action || '');
  if (a === 'trzEventos') return trzEventos_(String(p.exp || ''));
  if (a === 'trzResumen') return trzResumen_();
  if (a === 'trzPasos')   return { success: true, pasos: TRZ_PASOS };
  if (a === 'trzPersonas') return { success: true, personas: trzPersonas_() };
  // Administración de panel_confirmacion (PANEL_ADMIN.gs), si está instalada.
  if (typeof admRuta_ === 'function') return admRuta_(e);
  return null;
}

function trzPost_(payload) {
  if (typeof incPost_ === 'function') { var _incp = incPost_(payload); if (_incp) return _incp; }   // Expediente de Incumplimiento (INCUMPLIMIENTOS_TRZ.gs)
  var a = String((payload && payload.action) || '');
  // Administración de panel_confirmacion (PANEL_ADMIN.gs) usa el mismo PIN.
  if (a.indexOf('adm') === 0) return (typeof admPost_ === 'function') ? admPost_(payload) : null;
  if (a.indexOf('trz') !== 0) return null;
  try {
    var d = payload.data || {};
    if (a === 'trzLogin')     return trzLogin_(d);
    if (a === 'trzRegistrar') return trzRegistrar_(d);
    if (a === 'trzAnular')    return trzAnular_(d);
    if (a === 'trzAltaManual') return trzAltaManual_(d);
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
  if (rol === 'SUPERVISOR' || rol === 'REGISTRADOR') return TRZ_PASOS.map(function (p) { return p[0]; });
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
    pasos: trzPasosDeArea_(r.usuario.area, r.usuario.rol),
    personas: trzPersonas_()
  };
}

/* ------------------------------------------------------------------ */
/*  Personas («Quién lo hizo»)                                          */
/* ------------------------------------------------------------------ */

/* Hoja TRZ_PERSONAS; si no existe se crea con el equipo inicial. */
function trzHojaPersonas_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nueva = !ss.getSheetByName(TRZ_HOJA_PERSONAS);
  var sh = trzHoja_(TRZ_HOJA_PERSONAS, TRZ_COLS_PERSONAS);
  if (nueva || sh.getLastRow() < 2) {
    var hoy = new Date();
    var filas = TRZ_PERSONAS_INICIALES.map(function (p) { return [p[0], p[1], p[2], 'Jefatura de Control Operativo', hoy, p[2] === 'NO' ? 'Histórico: ya no participa en el proceso' : 'Equipo inicial']; });
    sh.getRange(2, 1, filas.length, TRZ_COLS_PERSONAS.length).setValues(filas);
    SpreadsheetApp.flush();
  }
  return sh;
}

/* Lista para el desplegable: activas y pendientes (las inactivas, NO, se ocultan). */
function trzPersonas_() {
  var sh = trzHojaPersonas_();
  var v = sh.getDataRange().getValues(), c = trzIdx_(v[0]), out = [];
  for (var i = 1; i < v.length; i++) {
    var n = String(v[i][c.NOMBRE] || '').replace(/\s+/g, ' ').trim();
    if (!n) continue;
    var act = String(v[i][c.ACTIVO] || 'SI').trim().toUpperCase();
    if (act === 'NO') continue;
    out.push({ nombre: n, area: String(v[i][c.AREA] || '').trim(), pendiente: act === 'PENDIENTE' });
  }
  return out;
}

/* Persona nueva escrita en el formulario: entra como PENDIENTE, en el área del paso. */
function trzAgregarPersona_(nombre, area, altaPor) {
  var n = String(nombre || '').replace(/\s+/g, ' ').trim();
  var ya = trzPersonas_().some(function (p) { return trzNorm_(p.nombre) === trzNorm_(n) && trzNorm_(p.area) === trzNorm_(area); });
  if (ya) return false;
  var sh = trzHojaPersonas_();
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var fila = { NOMBRE: n, AREA: area, ACTIVO: 'PENDIENTE', ALTA_POR: altaPor, ALTA_TS: new Date(), NOTA: 'Agregada desde el tablero; la jefatura la reconoce poniendo SI' };
  sh.appendRow(hdr.map(function (h) { var x = fila[String(h).trim().toUpperCase()]; return x == null ? '' : x; }));
  return true;
}

/* Si la bitácora es anterior a una columna nueva (p. ej. EJECUTOR), se agrega al final. */
function trzAsegurarColumnas_(sh, cols) {
  var hdr = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim().toUpperCase(); });
  cols.forEach(function (c) {
    if (hdr.indexOf(c) >= 0) return;
    sh.getRange(1, hdr.length + 1).setValue(c).setFontWeight('bold');
    hdr.push(c);
  });
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
      oc: String(v[i][c.OC] || ''),
      renglon: String(v[i][c.RENGLON] || ''),
      proveedor: String(v[i][c.PROVEEDOR] || ''),
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
      anuladoMotivo: String(v[i][c.ANULADO_MOTIVO] || ''),
      ejecutor: c.EJECUTOR != null ? String(v[i][c.EJECUTOR] || '') : ''
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
  var parcial = {};   // paso → último registro PARCIAL aún sin completar
  var ultimo = null, ultimoReal = null;
  eventos.forEach(function (ev) {
    if (ev.estado === 'ANULADO') return;
    // EMPALME (cuadro de Control): el expediente ya tenía hechos todos los pasos hasta este.
    if (ev.tipo === 'EMPALME') {
      var ke = orden.indexOf(ev.paso);
      for (var je = 0; je <= ke; je++) { if (!hechos[orden[je]]) hechos[orden[je]] = ev.ts || true; delete parcial[orden[je]]; }
    }
    if (ev.tipo === 'TRANSFIERE') { hechos[ev.paso] = ev.ts || true; delete parcial[ev.paso]; }
    if (ev.tipo === 'PARCIAL') parcial[ev.paso] = { ts: ev.ts, motivo: ev.motivo || '' };
    if (ev.tipo === 'DEVUELVE') {
      var k = orden.indexOf(ev.dest);
      for (var j = k; j < orden.length; j++) { delete hechos[orden[j]]; delete parcial[orden[j]]; }
    }
    ultimo = ev;
    if (ev.tipo !== 'EMPALME') ultimoReal = ev;
  });
  var sig = null;
  for (var i = 0; i < orden.length; i++) if (!hechos[orden[i]]) { sig = orden[i]; break; }
  return { hechos: hechos, siguiente: sig, ultimo: ultimo, ultimoReal: ultimoReal, completos: Object.keys(hechos).length,
           parcial: (sig && parcial[sig]) ? parcial[sig] : null };
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
      parcial: st.parcial ? true : false,
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
  if (tipo !== 'TRANSFIERE' && tipo !== 'DEVUELVE' && tipo !== 'PARCIAL') return { success: false, error: 'Resultado no válido.' };

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
  if (tipo === 'PARCIAL') {
    motivo = String(d.motivo || '').trim();
    if (!motivo) return { success: false, error: 'Indique por qué el paso queda parcial (p. ej. adelanto).' };
  }

  // Quién lo hizo: de la lista TRZ_PERSONAS o una persona nueva (queda PENDIENTE).
  var ejecutor = String(d.ejecutor || '').replace(/\s+/g, ' ').trim() || u.nombre;
  if (ejecutor.length < 3 || ejecutor.length > 80) return { success: false, error: 'Escriba nombre y apellido de quien hizo el paso.' };

  var fh = trzParseFecha_(d.ts);
  if (!fh) return { success: false, error: 'Fecha y hora del hito no válidas.' };
  if (fh.getTime() > Date.now() + 10 * 60 * 1000) return { success: false, error: 'La fecha del hito no puede ser futura.' };
  if (fh.getTime() < fRec.getTime()) return { success: false, error: 'La fecha del hito es anterior a la recepción.' };

  // Evidencia opcional (13-nov-2026): si viene, se valida y va a Drive.
  var hayEvid = !!(d.evidencia && d.evidencia.base64), bytes = null, mime = '';
  if (hayEvid) {
    bytes = Utilities.base64Decode(String(d.evidencia.base64));
    if (bytes.length > TRZ_MAX_BYTES) return { success: false, error: 'La evidencia supera 8 MB.' };
    mime = String(d.evidencia.mime || 'application/octet-stream');
    if (!/^image\/|^application\/pdf$/.test(mime)) return { success: false, error: 'La evidencia debe ser foto o PDF.' };
  }

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
    if (st.ultimoReal) {   // las fechas del cuadro (EMPALME) no frenan el registro
      var fu = trzParseFecha_(st.ultimoReal.ts);
      if (fu && fh.getTime() < fu.getTime()) return { success: false, error: 'La fecha es anterior al último hito registrado (' + st.ultimoReal.ts.replace('T', ' ') + ').' };
    }

    // 5. Evidencia (si la hay) a Drive: Sustento / Trazabilidad RB / AAAA-MM / expediente
    var archivo = null, nombre = '';
    if (hayEvid) {
      var cTrz = trzCarpetaRaiz_();
      var cMes = getOrCreateSubfolder_(cTrz, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'));
      var cExp = getOrCreateSubfolder_(cMes, exp.replace(/[\/\\:*?"<>|]/g, '-'));
      var ext = (typeof inferirExtension_ === 'function') ? inferirExtension_(String(d.evidencia.nombre || ''), mime) : (mime.indexOf('pdf') >= 0 ? '.pdf' : '.jpg');
      nombre = exp + '_' + paso + '_' + tipo + '_' + Utilities.formatDate(fh, Session.getScriptTimeZone(), 'yyyyMMdd-HHmm') + ext;
      archivo = cExp.createFile(Utilities.newBlob(bytes, mime, nombre));
    }
    var personaNueva = false;
    if (d.ejecutorNuevo) { try { personaNueva = trzAgregarPersona_(ejecutor, TRZ_PASOS[iPaso][1], u.nombre); } catch (eP) {} }

    var idEv = 'EV-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);
    var sh = trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS);
    trzAsegurarColumnas_(sh, ['EJECUTOR']);
    var fila = {};
    fila.TS_SERVIDOR = new Date(); fila.ID_EVENTO = idEv; fila.ID_CLIENTE = idCliente; fila.EXPEDIENTE = exp;
    fila.OC = String(d.oc || ''); fila.RENGLON = String(d.renglon || ''); fila.PROVEEDOR = String(d.proveedor || '');
    fila.PASO = paso; fila.RESULTADO = tipo; fila.DESTINO = dest || ''; fila.MOTIVO = motivo || '';
    fila.FECHA_HITO = fh; fila.USUARIO = u.nombre; fila.AREA = u.area;
    fila.OBSERVACION = String(d.obs || '').slice(0, 500);
    fila.EVIDENCIA_URL = archivo ? archivo.getUrl() : ''; fila.EVIDENCIA_NOMBRE = nombre; fila.ESTADO = 'VIGENTE';
    fila.EJECUTOR = ejecutor;
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    sh.appendRow(hdr.map(function (h) { var x = fila[String(h).trim().toUpperCase()]; return x == null ? '' : x; }));

    var ev2 = trzLeerEventos_(exp);
    var st2 = trzEstado_(ev2);
    trzAgendarPublicacion_();
    return { success: true, id: idEv, evidUrl: archivo ? archivo.getUrl() : '', siguiente: st2.siguiente, completos: st2.completos,
      personaNueva: personaNueva,
      mensaje: tipo === 'DEVUELVE' ? ('Devuelto a ' + dest + '.') : (tipo === 'PARCIAL' ? ('Paso ' + paso + ' marcado como parcial: el expediente sigue en este paso.') : ('Paso ' + paso + ' registrado.')) };
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
      SpreadsheetApp.flush();
      try { trzPublicar_(false); } catch (eP) {}
      return { success: true, mensaje: 'Registro anulado. Queda en la bitácora como ANULADO.' };
    }
    return { success: false, error: 'No se encontró el hito.' };
  } finally {
    lock.releaseLock();
  }
}


/* ------------------------------------------------------------------ */
/*  Alta manual de una recepción que no trae el informe de Abasto       */
/* ------------------------------------------------------------------ */
/* Solo SUPERVISOR. Queda como un evento más de TRZ_EVENTOS (RESULTADO =
   ALTA_MANUAL, PASO = ALTA), con evidencia obligatoria en Drive; nada se
   borra y se anula con trzAnular_ como cualquier hito. El tablero la muestra
   como "Manual" y la concilia sola cuando el informe de Abasto trae la misma
   OC y renglón (±3 días) o cuando el kardex trae la entrada 101.
   Antes de grabar se verifica contra el informe publicado que no exista ya. */
var TRZ_ENTRADAS_URL = 'https://torredecontrolcss.github.io/SIGUELO/entradas_recepcion.json';

function trzAltaManual_(d) {
  var auth = trzAutenticar_(d.pin);
  if (auth.error) return { success: false, error: auth.error };
  var u = auth.usuario;
  if (u.rol !== 'SUPERVISOR') return { success: false, error: 'Solo un supervisor puede registrar una recepción no listada.' };

  var oc = String(d.oc || '').replace(/\D/g, '');
  if (!/^100\d{7}$/.test(oc)) return { success: false, error: 'La OC debe tener 10 dígitos y empezar con 100.' };
  var cod = String(d.renglon || '').replace(/\.0+$/, '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (!/^[0-9A-Z]{5,15}$/.test(cod)) return { success: false, error: 'Código de renglón no válido.' };
  var prov = String(d.proveedor || '').replace(/\s+/g, ' ').trim();
  if (!prov) return { success: false, error: 'Falta el proveedor.' };
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d.fRec || ''));
  if (!m) return { success: false, error: 'Fecha de recepción no válida.' };
  var fRec = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (fRec.getTime() > Date.now()) return { success: false, error: 'La fecha de recepción no puede ser futura.' };
  if (fRec.getTime() < new Date(2026, 4, 5).getTime()) return { success: false, error: 'El tablero empieza el 05/05/2026.' };
  var cant = Number(d.cant || 0);
  if (!(cant > 0)) return { success: false, error: 'Indique la cantidad recibida.' };
  var motivo = String(d.motivo || '').trim();
  if (!motivo) return { success: false, error: 'Indique el motivo.' };
  if (!d.evidencia || !d.evidencia.base64) return { success: false, error: 'Adjunte el informe de recepción firmado (foto o PDF).' };
  var bytes = Utilities.base64Decode(String(d.evidencia.base64));
  if (bytes.length > TRZ_MAX_BYTES) return { success: false, error: 'La evidencia supera 8 MB.' };
  var mime = String(d.evidencia.mime || '');
  if (!/^image\/|^application\/pdf$/.test(mime)) return { success: false, error: 'La evidencia debe ser foto o PDF.' };

  var exp = 'RB-' + oc + '-' + m[1] + m[2] + m[3];
  var dia = 864e5;

  // 1) ¿Ya está en el informe de Abasto publicado? (misma OC y renglón, ±3 días)
  try {
    var r = UrlFetchApp.fetch(TRZ_ENTRADAS_URL + '?_=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      var rows = JSON.parse(r.getContentText()).rows || [];
      for (var i = 0; i < rows.length; i++) {
        var e = rows[i];
        if (String(e.oc) !== oc || String(e.cod) !== cod) continue;
        var fe = new Date(String(e.fRec) + 'T00:00:00');
        if (Math.abs(fe.getTime() - fRec.getTime()) <= 3 * dia)
          return { success: false, existe: 'RB-' + oc + '-' + String(e.fRec).replace(/-/g, ''),
                   error: 'Esa recepción ya está en el informe de Abasto (' + e.fRec + '). No hace falta darla de alta.' };
      }
    }
  } catch (eF) { /* sin el informe, se valida solo contra la bitácora */ }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { success: false, error: 'El sistema está ocupado; reintente en unos segundos.' };
  try {
    // 2) ¿Ya hay un alta manual vigente igual?
    var todos = trzLeerEventos_('');
    for (var j = 0; j < todos.length; j++) {
      var t = todos[j];
      if (t.tipo !== 'ALTA_MANUAL' || t.estado === 'ANULADO') continue;
      var mm = /-(\d{4})(\d{2})(\d{2})$/.exec(t.exp), ocT = t.exp.split('-')[1];
      if (!mm || ocT !== oc) continue;
      var info = {}; try { info = JSON.parse(t.obs || '{}'); } catch (eJ) {}
      if (String(info.cod || '') !== cod) continue;
      var ft = new Date(Number(mm[1]), Number(mm[2]) - 1, Number(mm[3]));
      if (Math.abs(ft.getTime() - fRec.getTime()) <= 3 * dia)
        return { success: false, existe: t.exp, error: 'Ya hay un alta manual de esa recepción: ' + t.exp + '.' };
    }

    var cTrz = trzCarpetaRaiz_();
    var cMes = getOrCreateSubfolder_(cTrz, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'));
    var cExp = getOrCreateSubfolder_(cMes, exp);
    var ext = mime.indexOf('pdf') >= 0 ? '.pdf' : '.jpg';
    var nombre = exp + '_ALTA_MANUAL_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm') + ext;
    var archivo = cExp.createFile(Utilities.newBlob(bytes, mime, nombre));

    var det = {
      cod: cod, desc: String(d.desc || '').slice(0, 200), mat: String(d.mat || '').slice(0, 20),
      safiro: String(d.safiro || '').replace(/\D/g, '').slice(0, 12), entrega: String(d.entrega || '').slice(0, 4),
      cant: cant, valor: Number(d.valor || 0) || 0, motivo: motivo.slice(0, 120), nota: String(d.nota || '').slice(0, 300)
    };
    var idEv = 'EV-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);
    var sh = trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS);
    var fila = {
      TS_SERVIDOR: new Date(), ID_EVENTO: idEv, ID_CLIENTE: String(d.idCliente || '').slice(0, 64), EXPEDIENTE: exp,
      OC: oc, RENGLON: cod, PROVEEDOR: prov, PASO: 'ALTA', RESULTADO: 'ALTA_MANUAL', DESTINO: '', MOTIVO: det.motivo,
      FECHA_HITO: fRec, USUARIO: u.nombre, AREA: u.area, OBSERVACION: JSON.stringify(det),
      EVIDENCIA_URL: archivo.getUrl(), EVIDENCIA_NOMBRE: nombre, ESTADO: 'VIGENTE'
    };
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    sh.appendRow(hdr.map(function (h) { var x = fila[String(h).trim().toUpperCase()]; return x == null ? '' : x; }));
    SpreadsheetApp.flush();
    try { trzPublicar_(false); } catch (eP) {}   // que el tablero lo vea de inmediato
    return { success: true, exp: exp, id: idEv, evidUrl: archivo.getUrl(), mensaje: 'Recepción registrada: ' + exp + '.' };
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
  su.getRange('D2:D300').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(TRZ_ROLES, true).build());
  var sp = trzHojaPersonas_();
  sp.getRange('B2:B300').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(areas, true).build());
  sp.getRange('C2:C300').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'PENDIENTE', 'NO'], true).build());
  trzAsegurarColumnas_(trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS), ['EJECUTOR']);
  su.getRange('E2:E300').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).build());
  trzSincronizarEquipo_(su, sp);
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

/* Equipo de Control Operativo en TRZ_PERSONAS y TRZ_USUARIOS (se puede repetir).
   · TRZ_PERSONAS: corrige el nombre si la persona ya está en su área (mismo
     primer nombre) y agrega a quien falte. Landecho queda como histórico (NO).
   · TRZ_USUARIOS: agrega la fila de quien no tenga usuario, con el PIN vacío:
     el PIN lo pone la Torre de Control (últimos 4 dígitos de la cédula). */
function trzSincronizarEquipo_(su, sp) {
  var primer = function (n) { return trzNorm_(String(n).split(' ')[0]); };
  var vp = sp.getDataRange().getValues(), cp = trzIdx_(vp[0]);
  TRZ_PERSONAS_INICIALES.forEach(function (p) {
    for (var i = 1; i < vp.length; i++) {
      if (trzNorm_(vp[i][cp.AREA]) === trzNorm_(p[1]) && primer(vp[i][cp.NOMBRE]) === primer(p[0])) {
        if (String(vp[i][cp.NOMBRE]) !== p[0]) sp.getRange(i + 1, cp.NOMBRE + 1).setValue(p[0]);
        if (p[2] === 'NO') { sp.getRange(i + 1, cp.ACTIVO + 1).setValue('NO'); sp.getRange(i + 1, cp.NOTA + 1).setValue('Histórico: ya no participa en el proceso'); }
        return;
      }
    }
    sp.appendRow([p[0], p[1], p[2], 'Jefatura de Control Operativo', new Date(), p[2] === 'NO' ? 'Histórico: ya no participa en el proceso' : 'Equipo inicial']);
  });
  var vu = su.getDataRange().getValues(), cu = trzIdx_(vu[0]);
  TRZ_PERSONAS_INICIALES.forEach(function (p) {
    if (!p[3]) return;
    var tiene = vu.slice(1).some(function (r) { return trzNorm_(r[cu.AREA]) === trzNorm_(p[1]) && primer(r[cu.NOMBRE]) === primer(p[0]); });
    if (!tiene) su.appendRow(['', p[0], p[1], p[3], 'SI', '', 'Falta el PIN: últimos 4 dígitos de la cédula']);
  });
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
  // Compacto: sin campos vacíos ni datos que el tablero ya tiene (OC, renglón, proveedor).
  var ev = trzLeerEventos_('').map(function (x) {
    var quitar = x.tipo === 'ALTA_MANUAL' ? ['fila', 'idCliente', 'evid'] : ['fila', 'idCliente', 'oc', 'renglon', 'proveedor', 'tsServidor', 'evid'];   // el alta manual los necesita
    quitar.forEach(function (k) { delete x[k]; });
    if (x.estado === 'VIGENTE') delete x.estado;
    Object.keys(x).forEach(function (k) { if (x[k] === '' || x[k] === null) delete x[k]; });
    return x;
  });
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

/* ------------------------------------------------------------------ */
/*  Publicación agendada (45 s después de cada registro)               */
/* ------------------------------------------------------------------ */
function trzAgendarPublicacion_() {
  try {
    var ya = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'trzDisparoUnico'; });
    if (!ya) ScriptApp.newTrigger('trzDisparoUnico').timeBased().after(45 * 1000).create();
  } catch (e) { Logger.log('trzAgendarPublicacion_: ' + e); }
}
function trzDisparoUnico() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'trzDisparoUnico') ScriptApp.deleteTrigger(t); });
  trzDiferido_();
}

/* ------------------------------------------------------------------ */
/*  Empalme con el cuadro de Control Operativo                          */
/* ------------------------------------------------------------------ */

/* Ejecutar desde el editor. Lee trazabilidad_empalme.json y agrega a
   TRZ_EVENTOS los hitos que el cuadro ya tenía. No duplica: cada evento
   lleva su ID_CLIENTE (EMP-expediente-paso). Al final publica la bitácora. */
function trzImportarEmpalme() {
  var r = UrlFetchApp.fetch(TRZ_URL_EMPALME + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('No se pudo leer ' + TRZ_URL_EMPALME + ' (' + r.getResponseCode() + ')');
  var j = JSON.parse(r.getContentText('UTF-8'));
  var sh = trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS);
  trzAsegurarColumnas_(sh, ['EJECUTOR']);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var ya = {};
    trzLeerEventos_('').forEach(function (x) { if (x.idCliente) ya[x.idCliente] = true; });
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim().toUpperCase(); });
    var ahora = new Date(), filas = [], n = 0;
    (j.eventos || []).forEach(function (e) {
      if (ya[e.id]) return;
      n++;
      var f = {
        TS_SERVIDOR: ahora, ID_EVENTO: 'EV-EMP-' + Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + n,
        ID_CLIENTE: e.id, EXPEDIENTE: e.exp, OC: e.oc || '', RENGLON: e.renglon || '', PROVEEDOR: e.proveedor || '',
        PASO: e.paso, RESULTADO: e.tipo || 'EMPALME', DESTINO: '', MOTIVO: e.motivo || '',
        FECHA_HITO: e.ts ? trzParseFecha_(e.ts) : '', USUARIO: TRZ_USUARIO_EMPALME, AREA: 'Control Operativo',
        OBSERVACION: String(e.obs || '').slice(0, 500), EVIDENCIA_URL: '', EVIDENCIA_NOMBRE: '', ESTADO: 'VIGENTE',
        EJECUTOR: e.ejecutor || ''
      };
      filas.push(hdr.map(function (h) { var x = f[h]; return x == null ? '' : x; }));
    });
    if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, hdr.length).setValues(filas);
    SpreadsheetApp.flush();
    Logger.log('Empalme: ' + filas.length + ' eventos nuevos (de ' + (j.eventos || []).length + ' en el archivo; los demás ya estaban).');
  } finally { lock.releaseLock(); }
  trzEscribirCuadro_(j.cuadro);
  var p = trzPublicar_(true);
  Logger.log(p.success ? ('trazabilidad_eventos.json publicado: ' + p.filas + ' eventos.') : ('No publicado: ' + p.error));
}

/* Hoja TRZ_CUADRO_CONTROL: el cuadro del departamento completo, fila por fila,
   con lo que pasó en el empalme (EMPALMADO / ANTERIOR AL TABLERO / SIN PAREJA)
   y el expediente del tablero. Se reescribe cada vez que se importa. */
function trzEscribirCuadro_(cu) {
  if (!cu || !cu.cols || !cu.filas) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('TRZ_CUADRO_CONTROL') || ss.insertSheet('TRZ_CUADRO_CONTROL');
  sh.clear(); sh.clearConditionalFormatRules();
  if (sh.getFilter()) sh.getFilter().remove();
  var n = cu.cols.length;
  var filas = cu.filas.map(function (r) { var x = r.slice(0, n); while (x.length < n) x.push(''); return x; });
  sh.getRange(1, 1, 1, n).setValues([cu.cols]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#0C447C').setWrap(true);
  if (filas.length) sh.getRange(2, 1, filas.length, n).setValues(filas);
  sh.setFrozenRows(1); sh.setFrozenColumns(2);
  sh.getRange(1, 1, filas.length + 1, n).createFilter();
  var g = sh.getRange(2, 2, Math.max(1, filas.length), 1), reglas = [];
  [['EMPALMADO', '#e2f0e6'], ['ANTERIOR AL TABLERO', '#eceff3'], ['SIN PAREJA', '#faf0d7']].forEach(function (c) {
    reglas.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(c[0]).setBackground(c[1]).setRanges([g]).build());
  });
  sh.setConditionalFormatRules(reglas);
  sh.setColumnWidth(3, 320); sh.setColumnWidth(4, 190);
  SpreadsheetApp.flush();
  Logger.log('TRZ_CUADRO_CONTROL: ' + filas.length + ' filas del cuadro.');
}

/* Deshacer el empalme: marca ANULADO todos los eventos EMPALME (y los PARCIAL
   que vinieron del cuadro). No borra filas. */
function trzAnularEmpalme() {
  var sh = trzHoja_(TRZ_HOJA_EVENTOS, TRZ_COLS_EVENTOS);
  var v = sh.getDataRange().getValues(), c = trzIdx_(v[0]), n = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][c.USUARIO]) !== TRZ_USUARIO_EMPALME || String(v[i][c.ESTADO]) === 'ANULADO') continue;
    sh.getRange(i + 1, c.ESTADO + 1).setValue('ANULADO');
    sh.getRange(i + 1, c.ANULADO_POR + 1).setValue('Torre de Control');
    sh.getRange(i + 1, c.ANULADO_TS + 1).setValue(new Date());
    sh.getRange(i + 1, c.ANULADO_MOTIVO + 1).setValue('Se deshizo el empalme con el cuadro');
    n++;
  }
  SpreadsheetApp.flush();
  Logger.log('Empalme anulado: ' + n + ' eventos.');
  trzPublicar_(true);
}
