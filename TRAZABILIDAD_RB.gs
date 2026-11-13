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
 *  Correos (13-nov-2026), por la salida única correoEnviar_ (Resend):
 *    · Cada registro deja un aviso en TRZ_AVISOS y a los ~45 s se envía:
 *      completado → al área del paso siguiente; devuelto → al área que debe
 *      corregir; parcial → a los jefes. Siempre con copia a los jefes
 *      (ROL SUPERVISOR con CORREO en TRZ_USUARIOS) y a COPIA DE AVISOS.
 *    · trzCorreoDiario(): informe ejecutivo de lunes a viernes, 7:00, a los
 *      jefes y a INFORME DIARIO: por dónde va cada expediente, qué se movió,
 *      qué está parado y los parciales (adelantos).
 *    · Correos por área: TRZ_USUARIOS.CORREO y la hoja TRZ_CORREOS_AREA
 *      (para áreas sin usuario, como Cómputo o DINALOG).
 *    · Propiedad TRZ_CORREO_MODO: PRUEBA (por defecto: todo llega solo a
 *      TRZ_CORREO_PRUEBA o a la cuenta del script, con la lista de quién lo
 *      recibiría) | REAL | APAGADO. Instalar: trzCorreoInstalar().
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
    try {
      trzEncolarAviso_({ id: idEv, exp: exp, paso: paso, tipo: tipo, dest: dest || '', motivo: motivo || '', ts: d.ts,
        ejecutor: ejecutor, registro: u.nombre, area: u.area, oc: fila.OC, renglon: fila.RENGLON, proveedor: fila.PROVEEDOR,
        obs: fila.OBSERVACION, evidUrl: fila.EVIDENCIA_URL, siguiente: st2.siguiente || '', completos: st2.completos });
    } catch (eA) { Logger.log('trzEncolarAviso_: ' + eA); }
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
  trzHojaCorreosArea_(areas);
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
  try { trzEnviarAvisos_(); } catch (eA) { Logger.log('trzEnviarAvisos_ ERROR: ' + eA); }
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

/* ================================================================== */
/*  CORREOS: aviso por evento e informe diario para los jefes          */
/* ================================================================== */
var TRZ_HOJA_AVISOS = 'TRZ_AVISOS';
var TRZ_COLS_AVISOS = ['TS', 'ID_EVENTO', 'EXPEDIENTE', 'PASO', 'RESULTADO', 'DATOS', 'ESTADO', 'DETALLE'];
var TRZ_HOJA_CORREOS = 'TRZ_CORREOS_AREA';
var TRZ_TABLERO = 'https://torrecontrolcss.org/SIGUELO/trazabilidad.html';
var TRZ_LOGO = 'https://torrecontrolcss.org/SIGUELO/icons/icon-192.png';
var TRZ_DIAS_ALERTA = 5;   // días hábiles sin moverse que el informe marca en rojo

/* Hoja de correos por área (para áreas sin usuario) y listas especiales. */
function trzHojaCorreosArea_(areas) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nueva = !ss.getSheetByName(TRZ_HOJA_CORREOS);
  var sh = trzHoja_(TRZ_HOJA_CORREOS, ['AREA', 'CORREOS', 'NOTA']);
  if (nueva || sh.getLastRow() < 2) {
    var filas = areas.map(function (a) { return [a, '', 'Correos separados por coma. Se suman a los de TRZ_USUARIOS de esta área.']; });
    filas.push(['INFORME DIARIO', '', 'Reciben el informe diario además de los jefes (ROL SUPERVISOR).']);
    filas.push(['COPIA DE AVISOS', '', 'Reciben copia de cada aviso además de los jefes.']);
    sh.getRange(2, 1, filas.length, 3).setValues(filas);
    sh.setColumnWidth(2, 380); sh.setColumnWidth(3, 420);
  }
  return sh;
}

/* Quién recibe: por área (operadores y registradores con correo), jefes y listas especiales. */
function trzDestinatarios_() {
  var porArea = {}, jefes = [], diario = [], copia = [];
  var add = function (L, m) { m = String(m || '').trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) && L.indexOf(m) < 0) L.push(m); };
  var vu = trzHoja_(TRZ_HOJA_USUARIOS, ['PIN', 'NOMBRE', 'AREA', 'ROL', 'ACTIVO', 'CORREO', 'NOTA']).getDataRange().getValues(), cu = trzIdx_(vu[0]);
  for (var i = 1; i < vu.length; i++) {
    var r = vu[i];
    if (String(r[cu.ACTIVO] || 'SI').toUpperCase() === 'NO' || /PRUEBA/i.test(String(r[cu.NOTA] || ''))) continue;
    var rol = String(r[cu.ROL] || 'OPERADOR').toUpperCase();
    if (rol === 'SUPERVISOR') add(jefes, r[cu.CORREO]);
    else { var k = trzNorm_(r[cu.AREA]); porArea[k] = porArea[k] || []; add(porArea[k], r[cu.CORREO]); }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sc = ss.getSheetByName(TRZ_HOJA_CORREOS);
  if (sc && sc.getLastRow() > 1) {
    sc.getRange(2, 1, sc.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var k = trzNorm_(r[0]), L = String(r[1] || '').split(/[,;\s]+/);
      if (!k) return;
      if (k === 'INFORMEDIARIO') L.forEach(function (m) { add(diario, m); });
      else if (k === 'COPIADEAVISOS') L.forEach(function (m) { add(copia, m); });
      else { porArea[k] = porArea[k] || []; L.forEach(function (m) { add(porArea[k], m); }); }
    });
  }
  return { porArea: porArea, jefes: jefes, diario: diario, copia: copia };
}

function trzModoCorreo_() {
  var props = PropertiesService.getScriptProperties();
  var modo = String(props.getProperty('TRZ_CORREO_MODO') || 'PRUEBA').toUpperCase();
  return { modo: modo, prueba: props.getProperty('TRZ_CORREO_PRUEBA') || props.getProperty('INC_CORREO_PRUEBA') || Session.getEffectiveUser().getEmail() };
}

function trzEsc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function trzFd_(s) { s = String(s || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : ''; }
function trzPaso_(p) { for (var i = 0; i < TRZ_PASOS.length; i++) if (TRZ_PASOS[i][0] === p) return TRZ_PASOS[i]; return [p, '', '']; }
function trzCod_(p) { return p === 'C12' ? 'C·12→13' : p; }

function trzCabecera_(titulo, sub) {
  return '<table cellspacing="0" cellpadding="0" width="100%" style="background:#0c447c;border-radius:8px 8px 0 0"><tr>' +
    '<td width="64" style="padding:12px 0 12px 16px"><img src="' + TRZ_LOGO + '" width="48" height="48" alt="CSS" style="display:block;border:0;background:#fff;border-radius:50%"></td>' +
    '<td style="padding:12px 16px;color:#fff;font-family:Arial,sans-serif"><div style="font-size:11px;opacity:.85">CAJA DE SEGURO SOCIAL · DIRECCIÓN NACIONAL DE LOGÍSTICA</div>' +
    '<div style="font-size:11px;opacity:.85">TRAZABILIDAD DOCUMENTAL DE LA RECEPCIÓN · CONTROL OPERATIVO</div>' +
    '<div style="font-size:17px;font-weight:700;margin-top:2px">' + titulo + '</div>' + (sub ? '<div style="font-size:12px;opacity:.9;margin-top:2px">' + sub + '</div>' : '') + '</td></tr></table>';
}
function trzCaja_(cuerpo) {
  return '<div style="font-family:Arial,sans-serif;font-size:13px;color:#1f2937;max-width:760px">' + cuerpo +
    '<p style="font-size:11px;color:#6b7280;margin-top:14px">Correo automático de la Torre de Control · DINALOG. Se registra en el tablero de Trazabilidad con el PIN de cada área; no responda a este correo.</p></div>';
}
function trzBoton_(exp) {
  return '<p style="margin:14px 0 0"><a href="' + TRZ_TABLERO + '#' + encodeURIComponent(exp) + '" style="background:#1e5a9e;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Abrir el expediente</a></p>';
}

/* Manda respetando el modo. En PRUEBA todo va a la cuenta de prueba con la lista real arriba. */
function trzMandar_(o, etiqueta) {
  var m = trzModoCorreo_();
  if (m.modo === 'APAGADO') return 'APAGADO';
  var para = (o.to || []).filter(Boolean), cc = (o.cc || []).filter(function (x) { return x && para.indexOf(x) < 0; });
  if (m.modo !== 'REAL') {
    var av = '<div style="background:#fff4d6;border:1px solid #f2dc7a;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-family:Arial;font-size:12px"><b>PRUEBA.</b> En uso real este correo iría a: ' +
      (para.length ? trzEsc_(para.join(', ')) : '<i>nadie todavía: falta el correo de «' + trzEsc_(etiqueta) + '» en TRZ_USUARIOS o TRZ_CORREOS_AREA</i>') +
      (cc.length ? ' · con copia a ' + trzEsc_(cc.join(', ')) : '') + '.</div>';
    correoEnviar_({ to: m.prueba, subject: '[PRUEBA · ' + etiqueta + '] ' + o.subject, htmlBody: av + o.htmlBody, name: 'Torre de Control CSS' });
    return 'PRUEBA';
  }
  if (!para.length && !cc.length) return 'SIN_DESTINATARIO';
  if (!para.length) { para = cc; cc = []; }
  var x = { to: para.join(','), subject: o.subject, htmlBody: o.htmlBody, name: 'Torre de Control CSS' };
  if (cc.length) x.cc = cc.join(',');
  correoEnviar_(x);
  return 'ENVIADO';
}

/* --- Aviso por evento --- */
function trzEncolarAviso_(a) {
  var sh = trzHoja_(TRZ_HOJA_AVISOS, TRZ_COLS_AVISOS);
  sh.appendRow([new Date(), a.id, a.exp, a.paso, a.tipo, JSON.stringify(a), 'PENDIENTE', '']);
}

function trzEnviarAvisos_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRZ_HOJA_AVISOS);
  if (!sh || sh.getLastRow() < 2) return 0;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return 0;
  var n = 0;
  try {
    var v = sh.getDataRange().getValues(), c = trzIdx_(v[0]), dest = null;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][c.ESTADO]) !== 'PENDIENTE') continue;
      dest = dest || trzDestinatarios_();
      var res, det = '';
      try { var a = JSON.parse(v[i][c.DATOS]); var r = trzAvisoHtml_(a, dest); res = trzMandar_(r, r.etiqueta); det = r.resumen; }
      catch (e) { res = 'ERROR'; det = String(e && e.message || e).slice(0, 300); }
      sh.getRange(i + 1, c.ESTADO + 1, 1, 2).setValues([[res, det]]);
      n++;
    }
  } finally { lock.releaseLock(); }
  return n;
}

function trzAvisoHtml_(a, dest) {
  var jefes = dest.jefes.concat(dest.copia.filter(function (m) { return dest.jefes.indexOf(m) < 0; }));
  var pa = trzPaso_(a.paso), para = [], cc = jefes, titulo, frase, etiqueta, asunto;
  var dato = [['Proveedor', a.proveedor], ['Orden de compra · renglón', a.oc + ' · ' + a.renglon],
    ['Paso registrado', trzCod_(a.paso) + ' · ' + pa[1] + ' — ' + pa[2]],
    ['Quién lo hizo', a.ejecutor + (a.registro && a.registro !== a.ejecutor ? ' (lo registró ' + a.registro + ')' : '')],
    ['Fecha del hito', String(a.ts || '').replace('T', ' ')]];
  if (a.motivo) dato.push(['Motivo', a.motivo]);
  if (a.obs) dato.push(['Observación', a.obs]);
  if (a.evidUrl) dato.push(['Evidencia', '<a href="' + trzEsc_(a.evidUrl) + '">ver documento</a>']);
  if (a.tipo === 'TRANSFIERE' && a.siguiente) {
    var ps = trzPaso_(a.siguiente);
    para = dest.porArea[trzNorm_(ps[1])] || []; etiqueta = ps[1];
    asunto = 'Le toca: ' + a.exp + ' · ' + trzCod_(a.siguiente) + ' ' + ps[1] + ' · ' + a.proveedor;
    titulo = 'Le toca a ' + trzEsc_(ps[1]);
    frase = 'El expediente <b>' + trzEsc_(a.exp) + '</b> completó <b>' + trzCod_(a.paso) + ' · ' + trzEsc_(pa[1]) + '</b> y ahora le toca a su área: <b>' + trzCod_(a.siguiente) + ' · ' + trzEsc_(ps[2]) + '</b>.';
  } else if (a.tipo === 'TRANSFIERE') {
    para = jefes; cc = []; etiqueta = 'Jefes · cierre';
    asunto = 'Expediente completado: ' + a.exp + ' · ' + a.proveedor;
    titulo = 'Expediente completado';
    frase = 'El expediente <b>' + trzEsc_(a.exp) + '</b> completó los ' + TRZ_PASOS.length + ' pasos del proceso documental.';
  } else if (a.tipo === 'DEVUELVE') {
    var pd = trzPaso_(a.dest);
    para = dest.porArea[trzNorm_(pd[1])] || []; etiqueta = pd[1] + ' · devolución';
    asunto = 'Devuelto: ' + a.exp + ' regresa a ' + trzCod_(a.dest) + ' ' + pd[1] + ' · ' + a.motivo;
    titulo = 'Expediente devuelto a ' + trzEsc_(pd[1]);
    frase = 'El expediente <b>' + trzEsc_(a.exp) + '</b> fue devuelto desde <b>' + trzCod_(a.paso) + ' · ' + trzEsc_(pa[1]) + '</b> a <b>' + trzCod_(a.dest) + ' · ' + trzEsc_(pd[2]) + '</b>. Corrija y vuelva a registrar el paso.';
  } else {
    para = jefes; cc = []; etiqueta = 'Jefes · parcial';
    asunto = 'Parcial: ' + a.exp + ' sigue en ' + trzCod_(a.paso) + ' ' + pa[1] + ' · ' + a.motivo;
    titulo = 'Paso parcial';
    frase = 'El expediente <b>' + trzEsc_(a.exp) + '</b> quedó <b>parcial</b> en <b>' + trzCod_(a.paso) + ' · ' + trzEsc_(pa[1]) + '</b>: sigue en ese paso hasta que se complete.';
  }
  var tabla = '<table cellspacing="0" style="font-size:13px;border-collapse:collapse;margin:10px 0">' + dato.map(function (r) {
    return '<tr><td style="padding:3px 14px 3px 0;color:#6b7280;vertical-align:top">' + r[0] + '</td><td style="padding:3px 0"><b>' + (r[0] === 'Evidencia' ? r[1] : trzEsc_(r[1])) + '</b></td></tr>'; }).join('') + '</table>';
  var html = trzCaja_(trzCabecera_(titulo, trzEsc_(a.exp)) +
    '<div style="padding:12px 16px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px"><p style="font-size:15px;margin:4px 0 8px">' + frase + '</p>' + tabla + trzBoton_(a.exp) + '</div>');
  return { to: para, cc: cc, subject: asunto, htmlBody: html, etiqueta: etiqueta, resumen: 'a: ' + (para.join(', ') || '—') + ' · cc: ' + (cc.join(', ') || '—') };
}

/* --- Informe diario --- */
function trzHabiles_(desde, hasta) {
  if (!desde || !hasta || hasta <= desde) return 0;
  var n = 0, d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()), h = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  while (d < h) { d.setDate(d.getDate() + 1); var w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

function trzCorreoDiario(e) {
  var forzar = e === 'PRUEBA';
  var m = trzModoCorreo_();
  if (m.modo === 'APAGADO' && !forzar) return 'apagado';
  var hoy = new Date(), w = hoy.getDay();
  if ((w === 0 || w === 6) && !forzar) return 'fin de semana';
  var desdeMov = new Date(hoy.getTime() - (w === 1 ? 3 : 1) * 864e5);   // lunes: desde el viernes
  var ev = trzLeerEventos_(''), por = {};
  ev.forEach(function (x) { if (/^RB-/.test(x.exp)) (por[x.exp] = por[x.exp] || []).push(x); });
  var abiertos = [], cerrados = 0, parciales = [], devueltos = 0, porPaso = {};
  Object.keys(por).forEach(function (k) {
    var L = por[k], st = trzEstado_(L);
    if (!st.siguiente) { cerrados++; return; }
    var mx = /-(\d{4})(\d{2})(\d{2})$/.exec(k), base = mx ? new Date(+mx[1], +mx[2] - 1, +mx[3]) : null, ult = base;
    L.forEach(function (x) { if (x.estado === 'ANULADO') return; var f = trzParseFecha_(x.ts); if (f && (!ult || f > ult)) ult = f; });
    var prov = ''; L.some(function (x) { if (x.proveedor) { prov = x.proveedor; return true; } return false; });
    var u = st.ultimoReal || st.ultimo;
    var o = { exp: k, prov: prov, paso: st.siguiente, area: trzPaso_(st.siguiente)[1], dias: trzHabiles_(ult, hoy), devuelto: u && u.tipo === 'DEVUELVE', parcial: st.parcial };
    if (o.devuelto) devueltos++;
    if (o.parcial) parciales.push(o);
    abiertos.push(o);
    (porPaso[o.paso] = porPaso[o.paso] || []).push(o);
  });
  var rojos = abiertos.filter(function (o) { return o.dias > TRZ_DIAS_ALERTA; }).length;
  var mov = ev.filter(function (x) { return x.tipo !== 'EMPALME' && x.quien !== TRZ_USUARIO_EMPALME && x.estado !== 'ANULADO' && x.tsServidor && trzParseFecha_(x.tsServidor) >= desdeMov; });
  var td = 'padding:5px 8px;border-bottom:1px solid #eef1f4', th = 'padding:5px 8px;text-align:left;background:#eef1f4;font-weight:600';
  var card = function (n, t, bg, fg) { return '<td style="background:' + bg + ';border-radius:8px;padding:10px 12px;width:20%"><div style="font-size:22px;font-weight:700;color:' + fg + '">' + n + '</div><div style="font-size:11px;color:#4b5563">' + t + '</div></td>'; };
  var cards = '<table cellspacing="6" style="width:100%;margin:6px 0"><tr>' +
    card(abiertos.length, 'expedientes en proceso', '#e6edf6', '#0c447c') + card(rojos, 'parados más de ' + TRZ_DIAS_ALERTA + ' días hábiles', '#f7e3e3', '#b3362e') +
    card(parciales.length, 'parciales (adelantos o incompletos)', '#ece6f7', '#6a4fa3') + card(devueltos, 'devueltos por corregir', '#faf0d7', '#a8700f') +
    card(cerrados, 'completados (publicados)', '#e2f0e6', '#1e7e34') + '</tr></table>';
  var tPaso = '<table cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse"><tr><th style="' + th + '">Paso</th><th style="' + th + '">Le toca a</th><th style="' + th + ';text-align:right">Expedientes</th><th style="' + th + ';text-align:right">Más de ' + TRZ_DIAS_ALERTA + ' días</th><th style="' + th + ';text-align:right">El que más espera</th></tr>' +
    TRZ_PASOS.filter(function (p) { return porPaso[p[0]]; }).map(function (p) {
      var L = porPaso[p[0]], r = L.filter(function (o) { return o.dias > TRZ_DIAS_ALERTA; }).length, mx = Math.max.apply(null, L.map(function (o) { return o.dias; }));
      return '<tr><td style="' + td + '">' + trzCod_(p[0]) + ' · ' + trzEsc_(p[2]) + '</td><td style="' + td + '">' + trzEsc_(p[1]) + '</td><td style="' + td + ';text-align:right">' + L.length + '</td><td style="' + td + ';text-align:right;color:' + (r ? '#b3362e' : '#6b7280') + '">' + r + '</td><td style="' + td + ';text-align:right">' + mx + ' d</td></tr>'; }).join('') + '</table>';
  var link = function (x) { return '<a href="' + TRZ_TABLERO + '#' + encodeURIComponent(x) + '" style="color:#1e5a9e;white-space:nowrap">' + trzEsc_(x) + '</a>'; };
  var top = abiertos.slice().sort(function (a, b) { return b.dias - a.dias; }).slice(0, 15);
  var tTop = '<table cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse"><tr><th style="' + th + '">Expediente</th><th style="' + th + '">Proveedor</th><th style="' + th + '">Está en</th><th style="' + th + ';text-align:right">Días hábiles</th></tr>' +
    top.map(function (o) { return '<tr><td style="' + td + '">' + link(o.exp) + '</td><td style="' + td + '">' + trzEsc_(o.prov) + '</td><td style="' + td + '">' + trzCod_(o.paso) + ' · ' + trzEsc_(o.area) + (o.devuelto ? ' · devuelto' : '') + (o.parcial ? ' · parcial' : '') + '</td><td style="' + td + ';text-align:right;color:' + (o.dias > TRZ_DIAS_ALERTA ? '#b3362e' : '#1f2937') + '">' + o.dias + '</td></tr>'; }).join('') + '</table>';
  var nomT = { TRANSFIERE: 'completado', PARCIAL: 'parcial', DEVUELVE: 'devuelto', ALTA_MANUAL: 'alta manual' };
  var tMov = mov.length ? '<table cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse"><tr><th style="' + th + '">Hora</th><th style="' + th + '">Expediente</th><th style="' + th + '">Paso</th><th style="' + th + '">Resultado</th><th style="' + th + '">Quién lo hizo</th></tr>' +
    mov.slice(-40).reverse().map(function (x) { return '<tr><td style="' + td + '">' + trzEsc_(String(x.tsServidor).replace('T', ' ').slice(5)) + '</td><td style="' + td + '">' + link(x.exp) + '</td><td style="' + td + '">' + trzCod_(x.paso) + '</td><td style="' + td + '">' + (nomT[x.tipo] || x.tipo) + (x.tipo === 'DEVUELVE' ? ' a ' + trzCod_(x.dest) : '') + (x.motivo ? ' · ' + trzEsc_(x.motivo) : '') + '</td><td style="' + td + '">' + trzEsc_(x.ejecutor || x.quien) + '</td></tr>'; }).join('') + '</table>' +
    (mov.length > 40 ? '<p style="font-size:11px;color:#6b7280">Se muestran los 40 más recientes de ' + mov.length + '.</p>' : '')
    : '<p style="color:#6b7280">No se registraron pasos ' + (w === 1 ? 'desde el viernes' : 'desde ayer') + '.</p>';
  var tPar = parciales.length ? '<table cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse"><tr><th style="' + th + '">Expediente</th><th style="' + th + '">Proveedor</th><th style="' + th + '">Paso</th><th style="' + th + '">Motivo</th></tr>' +
    parciales.map(function (o) { return '<tr><td style="' + td + '">' + link(o.exp) + '</td><td style="' + td + '">' + trzEsc_(o.prov) + '</td><td style="' + td + '">' + trzCod_(o.paso) + '</td><td style="' + td + '">' + trzEsc_(o.parcial.motivo || '') + '</td></tr>'; }).join('') + '</table>' : '<p style="color:#6b7280">No hay expedientes en parcial.</p>';
  var h2 = function (t) { return '<h3 style="font-size:14px;color:#0c447c;margin:18px 0 6px">' + t + '</h3>'; };
  var fecha = Utilities.formatDate(hoy, 'America/Panama', 'dd/MM/yyyy');
  var html = trzCaja_(trzCabecera_('Informe diario de trazabilidad', fecha) +
    '<div style="padding:12px 16px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
    '<p>Buenos días. Hay <b>' + abiertos.length + '</b> expedientes en el proceso documental' + (rojos ? ', <b style="color:#b3362e">' + rojos + ' parados más de ' + TRZ_DIAS_ALERTA + ' días hábiles</b>' : '') + '. ' +
    (mov.length ? 'Se registraron <b>' + mov.length + '</b> pasos ' + (w === 1 ? 'desde el viernes' : 'desde ayer') + '.' : 'No hubo registros ' + (w === 1 ? 'desde el viernes' : 'desde ayer') + '.') + '</p>' + cards +
    h2('Por dónde va cada cosa') + tPaso + h2('Los que más esperan') + tTop + h2('Lo que se movió ' + (w === 1 ? 'desde el viernes' : 'desde ayer')) + tMov + h2('Parciales: adelantos y expedientes incompletos') + tPar +
    '<p style="margin:16px 0 0"><a href="' + TRZ_TABLERO + '" style="background:#1e5a9e;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Abrir el tablero</a></p>' +
    '<p style="font-size:11px;color:#6b7280">Días hábiles de lunes a viernes desde el último paso registrado (o desde la recepción). Incluye los pasos tomados del cuadro de Control Operativo.</p></div>');
  var dest = trzDestinatarios_();
  var para = dest.jefes.concat(dest.diario.filter(function (x) { return dest.jefes.indexOf(x) < 0; }));
  var asunto = 'Trazabilidad documental · ' + abiertos.length + ' en proceso' + (rojos ? ' · ' + rojos + ' parados' : '') + ' · ' + fecha;
  var r = forzar ? (function () { var mm = trzModoCorreo_(); correoEnviar_({ to: mm.prueba, subject: '[PRUEBA · Informe diario] ' + asunto, htmlBody: '<div style="background:#fff4d6;border:1px solid #f2dc7a;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-family:Arial;font-size:12px"><b>PRUEBA.</b> En uso real iría a: ' + trzEsc_(para.join(', ') || 'nadie todavía') + '.</div>' + html, name: 'Torre de Control CSS' }); return 'PRUEBA'; })()
    : trzMandar_({ to: para, cc: [], subject: asunto, htmlBody: html }, 'Informe diario');
  Logger.log('Informe diario: ' + r + ' · ' + abiertos.length + ' en proceso, ' + rojos + ' parados, ' + mov.length + ' movimientos.');
  return r;
}

/* Ejecutar desde el editor: manda a su correo el informe diario y un aviso de ejemplo. */
function trzCorreoVistaPrevia() {
  trzCorreoDiario('PRUEBA');
  var dest = trzDestinatarios_();
  var r = trzAvisoHtml_({ exp: 'RB-1001027165-20260505', paso: 'P05', tipo: 'TRANSFIERE', siguiente: 'P06', ejecutor: 'Raymundo Quiel', registro: 'Mónica Quintero',
    ts: Utilities.formatDate(new Date(), 'America/Panama', "yyyy-MM-dd'T'HH:mm"), oc: '1001027165', renglon: '102063001', proveedor: 'NUTRIMED PANAMÁ, S.A.', motivo: '', obs: 'Ejemplo de aviso' }, dest);
  var mm = trzModoCorreo_();
  correoEnviar_({ to: mm.prueba, subject: '[PRUEBA · aviso de ejemplo] ' + r.subject, htmlBody: '<div style="background:#fff4d6;border:1px solid #f2dc7a;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-family:Arial;font-size:12px"><b>PRUEBA.</b> ' + trzEsc_(r.resumen) + '</div>' + r.htmlBody, name: 'Torre de Control CSS' });
  Logger.log('Vista previa enviada a ' + mm.prueba + '. Modo actual: ' + mm.modo + '.');
}

/* Ejecutar una vez: informe diario 7:00 (Panamá) de lunes a viernes. Deja el modo en PRUEBA si no hay. */
function trzCorreoInstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'trzCorreoDiario') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('trzCorreoDiario').timeBased().everyDays(1).atHour(7).inTimezone('America/Panama').create();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TRZ_CORREO_MODO')) props.setProperty('TRZ_CORREO_MODO', 'PRUEBA');
  var areas = []; TRZ_PASOS.forEach(function (p) { if (areas.indexOf(p[1]) < 0) areas.push(p[1]); });
  trzHojaCorreosArea_(areas); trzHoja_(TRZ_HOJA_AVISOS, TRZ_COLS_AVISOS);
  Logger.log('Informe diario 7:00 (Panamá) programado. Modo: ' + props.getProperty('TRZ_CORREO_MODO') + '. Para enviar a las áreas y jefes: TRZ_CORREO_MODO = REAL.');
}
