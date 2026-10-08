/**
 * ============================================================================
 *  CORREO_BREVO · Salida única de todos los correos de SIGUELO
 *  Diego Bethancourth · Torre de Control · DINALOG · CSS
 *  Proyecto: SIGUELO Backend (libro BASE DE DATOS DE CITAS)
 * ----------------------------------------------------------------------------
 *  Por qué: Gmail de la cuenta del script permite ~100 destinatarios al día.
 *  Los reportes internos (24 destinatarios cada uno), las confirmaciones del
 *  jueves y el barrido del viernes la agotaban, y lo que venía después (la
 *  agenda semanal del viernes) fallaba sin avisar a nadie.
 *
 *  Qué hace: correoEnviar_() recibe EXACTAMENTE lo mismo que MailApp.sendEmail
 *  (objeto de opciones o la forma (para, asunto, texto, opciones)) y:
 *    1) lo envía por Brevo (cuenta pagada de pedregaljuandiaz, sin límite diario),
 *       con adjuntos, copia (cc) y copia oculta (bcc);
 *    2) si Brevo falla, lo envía por Gmail como respaldo;
 *    3) anota cada correo en la hoja CORREO_BITACORA (quién lo mandó, a quién,
 *       por dónde salió y el error si lo hubo).
 *  Si fallan los dos, lanza el error como lo hacía MailApp, para que cada función
 *  siga manejándolo igual que antes.
 *
 *  PROPIEDADES DEL SCRIPT (usa las mismas del aviso a proveedores si no hay propias):
 *    SIGUELO_BREVO_KEY   clave API de Brevo (si falta, usa AVP_BREVO_KEY)
 *    SIGUELO_REMITENTE   remitente verificado (si falta, usa AVP_REMITENTE)
 *    SIGUELO_CORREO_VIA  BREVO (por defecto) | GMAIL  (GMAIL = volver a como era antes)
 *
 *  PRUEBA: ejecutar cbProbar() desde el editor → manda un correo con un PDF
 *  adjunto a la cuenta que corre el script y lo anota en CORREO_BITACORA.
 * ============================================================================
 */

var CB_HOJA = 'CORREO_BITACORA';
var CB_NOMBRE = 'Torre de Control CSS';

function correoEnviar_(a, b, c, d) {
  // Misma firma que MailApp.sendEmail: (opciones) o (para, asunto, texto[, opciones]).
  var o = {};
  if (a && typeof a === 'object') { for (var k in a) o[k] = a[k]; }
  else { var x = d || {}; for (var k2 in x) o[k2] = x[k2]; o.to = a; o.subject = b; o.body = c; }

  var origen = cbOrigen_();
  var props = PropertiesService.getScriptProperties();
  var via = String(props.getProperty('SIGUELO_CORREO_VIA') || 'BREVO').toUpperCase();
  var errBrevo = '';

  if (via !== 'GMAIL' && !o.inlineImages) {
    try {
      var id = cbBrevo_(o, props);
      cbLog_(origen, o, 'BREVO', 'OK' + (id ? ' · ' + id : ''));
      return;
    } catch (e) { errBrevo = String(e && e.message || e).slice(0, 250); }
  }
  try {
    MailApp.sendEmail(o);
    cbLog_(origen, o, 'GMAIL', errBrevo ? 'OK (Brevo falló: ' + errBrevo + ')' : 'OK');
  } catch (e2) {
    cbLog_(origen, o, 'NINGUNA', 'ERROR · Brevo: ' + (errBrevo || 'no usado') + ' · Gmail: ' + String(e2 && e2.message || e2).slice(0, 200));
    throw e2;
  }
}

/* Lista de correos desde texto "a@x, b@y" o arreglo. Sin repetidos ni vacíos. */
function cbLista_(v) {
  var arr = Array.isArray(v) ? v : String(v || '').split(/[,;]/);
  var out = [];
  arr.forEach(function (m) {
    m = String(m || '').trim();
    var mm = m.match(/<([^>]+)>/); if (mm) m = mm[1].trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) && out.map(function (z) { return z.toLowerCase(); }).indexOf(m.toLowerCase()) < 0) out.push(m);
  });
  return out;
}

function cbBrevo_(o, props) {
  var key = props.getProperty('SIGUELO_BREVO_KEY') || props.getProperty('AVP_BREVO_KEY');
  var rem = props.getProperty('SIGUELO_REMITENTE') || props.getProperty('AVP_REMITENTE');
  if (!key || !rem) throw new Error('Falta la clave o el remitente de Brevo en las propiedades del script.');

  var to = cbLista_(o.to), low = function (L) { return L.map(function (z) { return z.toLowerCase(); }); };
  if (!to.length) throw new Error('Sin destinatario válido.');
  var cc = cbLista_(o.cc).filter(function (m) { return low(to).indexOf(m.toLowerCase()) < 0; });
  var bcc = cbLista_(o.bcc).filter(function (m) { return low(to).concat(low(cc)).indexOf(m.toLowerCase()) < 0; });

  var body = {
    sender: { name: o.name || CB_NOMBRE, email: rem },
    to: to.map(function (m) { return { email: m }; }),
    subject: String(o.subject || '(sin asunto)')
  };
  if (cc.length) body.cc = cc.map(function (m) { return { email: m }; });
  if (bcc.length) body.bcc = bcc.map(function (m) { return { email: m }; });
  if (o.htmlBody) body.htmlContent = String(o.htmlBody);
  if (o.body) body.textContent = String(o.body);
  if (!body.htmlContent && !body.textContent) body.textContent = ' ';
  if (o.replyTo) { var rt = cbLista_(o.replyTo); if (rt.length) body.replyTo = { email: rt[0] }; }

  if (o.attachments && o.attachments.length) {
    body.attachment = o.attachments.map(function (bl, i) {
      var blob = bl.getBytes ? bl : bl.getBlob();
      var nombre = blob.getName() || ('adjunto_' + (i + 1));
      if (!/\.[a-z0-9]{2,5}$/i.test(nombre)) {
        var t = String(blob.getContentType() || '');
        nombre += /pdf/.test(t) ? '.pdf' : /sheet|excel/.test(t) ? '.xlsx' : /png/.test(t) ? '.png' : /jpe?g/.test(t) ? '.jpg' : /csv/.test(t) ? '.csv' : '.bin';
      }
      return { name: nombre, content: Utilities.base64Encode(blob.getBytes()) };
    });
  }

  var r = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'api-key': key, accept: 'application/json' }, payload: JSON.stringify(body)
  });
  var code = r.getResponseCode();
  if (code >= 300) throw new Error('Brevo ' + code + ': ' + r.getContentText().slice(0, 200));
  try { return JSON.parse(r.getContentText()).messageId || ''; } catch (e) { return ''; }
}

/* Nombre de la función que pidió el correo (para la bitácora). */
function cbOrigen_() {
  try {
    var st = String(new Error().stack || '').split('\n');
    for (var i = 0; i < st.length; i++) {
      var m = st[i].match(/at (\w+) /);
      if (m && ['cbOrigen_', 'correoEnviar_', 'Error'].indexOf(m[1]) < 0) return m[1];
    }
  } catch (e) {}
  return '';
}

function cbLog_(origen, o, via, resultado) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(CB_HOJA);
    if (!sh) {
      sh = ss.insertSheet(CB_HOJA);
      sh.getRange(1, 1, 1, 9).setValues([['FECHA', 'ORIGEN', 'VIA', 'PARA', 'CC', 'CCO', 'DESTINATARIOS', 'ASUNTO', 'RESULTADO']]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    var para = cbLista_(o.to), cc = cbLista_(o.cc), bcc = cbLista_(o.bcc);
    sh.appendRow([new Date(), origen, via, para.join(', '), cc.join(', '), bcc.join(', '), para.length + cc.length + bcc.length,
                  String(o.subject || '').slice(0, 150), resultado]);
  } catch (e) { Logger.log('cbLog_: ' + e); }
}

/* ---------------- Funciones para el editor ---------------- */

/* Manda un correo de prueba con un PDF adjunto a la cuenta que corre el script. */
function cbProbar() {
  var yo = Session.getEffectiveUser().getEmail();
  var pdf = Utilities.newBlob('<h2>Prueba de adjunto</h2><p>Si ve este PDF, los adjuntos por Brevo funcionan.</p>', MimeType.HTML, 'prueba.html').getAs(MimeType.PDF).setName('Prueba_Brevo.pdf');
  correoEnviar_({ to: yo, subject: '[PRUEBA] Salida de correos de SIGUELO por Brevo',
                  htmlBody: '<p>Este correo salió por <b>correoEnviar_</b>. Revise la hoja CORREO_BITACORA: la columna VIA debe decir BREVO.</p>',
                  attachments: [pdf], name: CB_NOMBRE });
  Logger.log('Prueba enviada a ' + yo + '. Revise CORREO_BITACORA.');
}

/* Resumen de hoy: cuántos correos salieron por Brevo, por Gmail y cuántos fallaron. */
function cbResumenHoy() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CB_HOJA);
  if (!sh || sh.getLastRow() < 2) { Logger.log('Sin correos registrados.'); return; }
  var hoy = Utilities.formatDate(new Date(), 'America/Panama', 'yyyy-MM-dd'), c = { BREVO: 0, GMAIL: 0, NINGUNA: 0 }, dest = 0;
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    if (!(r[0] instanceof Date) || Utilities.formatDate(r[0], 'America/Panama', 'yyyy-MM-dd') !== hoy) return;
    c[r[2]] = (c[r[2]] || 0) + 1; dest += Number(r[6]) || 0;
  });
  Logger.log('Hoy: ' + c.BREVO + ' por Brevo · ' + c.GMAIL + ' por Gmail (respaldo) · ' + c.NINGUNA + ' fallaron · ' + dest + ' destinatarios en total.');
}
