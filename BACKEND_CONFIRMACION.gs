/**
 * BACKEND_CONFIRMACION.gs
 * ---------------------------------------------------------------------------
 * Este archivo es una referencia para que el operador copie/pegue el código en
 * el proyecto de Google Apps Script que ya alimenta SIGUELO.
 *
 * IMPORTANTE:
 * 1. Agrega estas funciones al script existente.
 * 2. Vuelve a publicar el Web App después de guardar los cambios.
 * 3. Usa la misma URL pública del Apps Script en `app.js`.
 */

// ---------------------------------------------------------------------------
// Agregar al doGet(e) existente:
// ---------------------------------------------------------------------------
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  var callback = e && e.parameter && e.parameter.callback;

  if (action === 'getSolicitudesPendientes') {
    var pendientes = getSolicitudesPendientes();
    var payload = JSON.stringify(pendientes);
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + payload + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService
      .createTextOutput(payload)
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Mantener aquí el resto de acciones ya existentes como getCitasData / getData.
}

// ---------------------------------------------------------------------------
// Nueva función:
// ---------------------------------------------------------------------------
function getSolicitudesPendientes() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hojaFormulario = ss.getSheetByName('Respuestas de formulario 1');
    var hojaConfirmadas = ss.getSheetByName('Confirmacion de CITAS CSS');

    if (!hojaFormulario) {
      return { success: false, error: "No existe la hoja 'Respuestas de formulario 1'" };
    }

    var datosFormulario = hojaFormulario.getDataRange().getValues();
    if (datosFormulario.length <= 1) {
      return { success: true, data: [] };
    }

    var ordenesConfirmadas = {};
    if (hojaConfirmadas && hojaConfirmadas.getLastRow() > 1) {
      var datosConfirmados = hojaConfirmadas.getRange(2, 1, hojaConfirmadas.getLastRow() - 1, hojaConfirmadas.getLastColumn()).getValues();
      datosConfirmados.forEach(function(row) {
        var oc = String(row[8] || '').trim();
        if (oc) {
          ordenesConfirmadas[oc] = true;
        }
      });
    }

    var solicitudes = datosFormulario.slice(1).map(function(row, index) {
      return {
        id: 'SOL-' + (index + 1),
        marca_temporal: normalizarFecha(row[0]),
        correo: String(row[1] || '').trim(),
        fecha_solicitada: normalizarFecha(row[2]),
        fecha_vencimiento: normalizarFecha(row[3]),
        hora_solicitada: String(row[4] || '').trim(),
        nombre_proveedor: String(row[5] || row[6] || '').trim(),
        numero_orden_compra: String(row[7] || '').trim(),
        codigo_referencia: String(row[8] || '').trim(),
        descripcion_producto: String(row[9] || '').trim(),
        cantidad_unidades: row[10] || 0,
        cantidad_bultos: row[11] || 0,
        unidad_empaque: String(row[12] || '').trim(),
        cantidad_pallets: row[13] || 0,
        tipo_ambiente: String(row[14] || '').trim(),
        area_correspondiente: String(row[15] || '').trim(),
        nombre_solicitante: String(row[16] || '').trim(),
        correo_solicitante: String(row[17] || row[1] || '').trim(),
        telefono: String(row[18] || '').trim(),
        tipo_unidad_movil: String(row[19] || '').trim(),
        personal_empresa_entrega: String(row[20] || '').trim(),
        num_autorizacion_posterior: String(row[21] || '').trim(),
        num_autorizacion_plazo: String(row[22] || '').trim(),
        tipo_entrega: String(row[23] || '').trim(),
        anexo_doc: String(row[24] || '').trim(),
        observaciones: String(row[25] || '').trim(),
        anexo_lista_empaque: String(row[26] || '').trim()
      };
    }).filter(function(item) {
      return item.numero_orden_compra && !ordenesConfirmadas[item.numero_orden_compra];
    });

    return { success: true, data: solicitudes };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Agregar doPost(e):
// ---------------------------------------------------------------------------
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.action === 'confirmarCita') {
      return confirmarCita(payload.data);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Acción POST no reconocida' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ---------------------------------------------------------------------------
// Nueva función:
// ---------------------------------------------------------------------------
function confirmarCita(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName('Confirmacion de CITAS CSS');

    if (!hoja) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: "No existe la hoja 'Confirmacion de CITAS CSS'" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var row = new Array(22).fill('');
    row[0] = data.fecha_confirmada;
    row[1] = data.estado_cita;
    row[2] = data.hora_confirmada;
    row[7] = data.nombre_proveedor;
    row[8] = data.numero_orden_compra;
    row[9] = data.codigo_referencia;
    row[10] = data.descripcion_producto;
    row[11] = data.cantidad_unidades;
    row[12] = data.cantidad_bultos;
    row[14] = data.cantidad_pallets;
    row[15] = data.tipo_ambiente;
    row[16] = data.area_correspondiente;
    row[17] = data.nombre_solicitante;
    row[18] = data.correo_solicitante;
    row[19] = data.telefono;
    row[20] = data.tipo_unidad_movil;
    row[21] = data.personal_empresa_entrega;

    hoja.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function normalizarFecha(value) {
  if (!value) return '';
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
