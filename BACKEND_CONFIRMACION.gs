var FORM_SHEET_NAME = 'Respuestas de formulario 1';
var CONFIRM_SHEET_NAME = 'Confirmacion de CITAS CSS';
var CONF_OC_COL_INDEX = 8; // índice base 0 (columna 9 en hoja)

function doGet(e) {
  var action = e && e.parameter ? String(e.parameter.action || '') : '';
  var callback = e && e.parameter ? String(e.parameter.callback || '') : '';

  if (action === 'getCitasData' || (!action && callback)) {
    return createOutput_(getCitasData(), callback);
  }

  if (action === 'getSolicitudesPendientes') {
    return createOutput_(getSolicitudesPendientes(), callback);
  }

  return createOutput_({ success: false, error: 'Action missing or unsupported' }, callback);
}

function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = String(payload.action || '');

    if (action === 'confirmarCita') {
      return createOutput_(confirmarCita(payload.data), '');
    }

    if (action === 'actualizarCita') {
      return createOutput_(actualizarCita(payload.data), '');
    }

    return createOutput_({ success: false, error: 'Action not found' }, '');
  } catch (error) {
    return createOutput_({ success: false, error: String(error) }, '');
  }
}

function getCitasData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIRM_SHEET_NAME);
    if (!sheet) return { success: false, error: "No existe la hoja 'Confirmacion de CITAS CSS'" };
    if (sheet.getLastRow() <= 1) return { success: true, data: [], total: 0 };

    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 24)).getValues();
    var citas = data.map(function(row, index) {
      return {
        id: index + 1,
        fecha_confirmada: formatDate_(row[0]),
        estado_cita: toText_(row[1]),
        hora_confirmada: toText_(row[2]),
        correo: toText_(row[3]),
        fecha_solicitada: formatDate_(row[4]),
        fecha_vencimiento: formatDate_(row[5]),
        hora_solicitada: toText_(row[6]),
        nombre_proveedor: toText_(row[7]),
        numero_orden_compra: toText_(row[8]),
        codigo_referencia: toText_(row[9]),
        descripcion_producto: toText_(row[10]),
        cantidad_unidades: toNumber_(row[11]),
        cantidad_bultos: toNumber_(row[12]),
        unidad_empaque: toText_(row[13]),
        cantidad_pallets: toNumber_(row[14]),
        tipo_ambiente: toText_(row[15]),
        area_correspondiente: toText_(row[16]),
        nombre_solicitante: toText_(row[17]),
        correo_solicitante: toText_(row[18]),
        telefono: toText_(row[19]),
        tipo_unidad_movil: toText_(row[20]),
        personal_empresa_entrega: toText_(row[21]),
        tipo_entrega: toText_(row[22]),
        anexo_lista_empaque: toText_(row[23])
      };
    }).filter(function(cita) {
      return cita.numero_orden_compra;
    });

    return { success: true, data: citas, total: citas.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function getSolicitudesPendientes() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var formSheet = ss.getSheetByName(FORM_SHEET_NAME);
    var confirmSheet = ss.getSheetByName(CONFIRM_SHEET_NAME);

    if (!formSheet) {
      return { success: false, error: "No existe la hoja 'Respuestas de formulario 1'" };
    }

    var confirmedOCs = {};
    if (confirmSheet && confirmSheet.getLastRow() > 1) {
      var confirmedData = confirmSheet.getRange(2, 1, confirmSheet.getLastRow() - 1, Math.max(confirmSheet.getLastColumn(), 9)).getValues();
      confirmedData.forEach(function(row) {
        var oc = toText_(row[CONF_OC_COL_INDEX]);
        if (oc) confirmedOCs[oc] = true;
      });
    }

    var values = formSheet.getDataRange().getValues();
    var display = formSheet.getDataRange().getDisplayValues();
    if (values.length <= 1) return { success: true, data: [], total: 0 };

    var solicitudes = values.slice(1).map(function(src, index) {
      var srcDisplay = display[index + 1] || [];
      var oc = toText_(src[7]);
      return {
        id: index + 1,
        marca_temporal: formatDate_(src[0]),
        fecha_entrega_solicitada: formatDate_(src[2]),
        fecha_vencimiento: formatDate_(src[3]),
        hora_solicitada: toText_(srcDisplay[4] || src[4]),
        nombre_proveedor: toText_(src[5] || src[6]),
        numero_orden_compra: oc,
        codigo_referencia: toText_(src[8]),
        descripcion_producto: toText_(src[9]),
        cantidad_unidades: toNumber_(src[10]),
        cantidad_bultos: toNumber_(src[11]),
        cantidad_pallets: toNumber_(src[13]),
        tipo_ambiente: toText_(src[14]),
        area_correspondiente: toText_(src[15]),
        nombre_solicitante: toText_(src[16]),
        correo_solicitante: toText_(src[17] || src[1]),
        telefono: toText_(src[18]),
        tipo_unidad_movil: toText_(src[19]),
        personal_empresa_entrega: toText_(src[20]),
        tipo_entrega: toText_(src[23]),
        observaciones: toText_(src[25]),
        _srcRow: normalizeSourceRow_(src)
      };
    }).filter(function(item) {
      return item.numero_orden_compra && !confirmedOCs[item.numero_orden_compra];
    });

    return { success: true, data: solicitudes, total: solicitudes.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function confirmarCita(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIRM_SHEET_NAME);
    if (!sheet) return { success: false, error: "No existe la hoja 'Confirmacion de CITAS CSS'" };

    var src = Array.isArray(data && data.src_row) ? data.src_row : buildFallbackSource_(data || {});
    var dest = new Array(24).fill('');
    dest[0] = toText_(data && data.fecha_confirmada);
    dest[1] = toText_(data && data.estado_cita);
    dest[2] = toText_(data && data.hora_confirmada);
    dest[3] = src[1];
    dest[4] = src[2];
    dest[5] = src[3];
    dest[6] = src[4];
    dest[7] = src[5] || src[6];
    dest[8] = src[7];
    dest[9] = src[8];
    dest[10] = src[9];
    dest[11] = src[10];
    dest[12] = src[11];
    dest[13] = src[12];
    dest[14] = src[13];
    dest[15] = src[15];
    dest[16] = src[16];
    dest[17] = src[17];
    dest[18] = src[18];
    dest[19] = src[19];
    dest[20] = src[20];
    dest[21] = src[21];
    dest[22] = src[14];
    dest[23] = src[26];

    sheet.appendRow(dest);
    return { success: true, message: 'Cita confirmada exitosamente' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function actualizarCita(data) {
  try {
    var numeroOrdenCompra = toText_(data && data.numero_orden_compra);
    if (!numeroOrdenCompra) {
      return { success: false, error: 'numero_orden_compra es obligatorio' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIRM_SHEET_NAME);
    if (!sheet) return { success: false, error: "No existe la hoja 'Confirmacion de CITAS CSS'" };
    if (sheet.getLastRow() <= 1) return { success: false, error: 'No hay filas para actualizar' };

    var ocValues = sheet.getRange(2, 9, sheet.getLastRow() - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < ocValues.length; i++) {
      if (toText_(ocValues[i][0]) === numeroOrdenCompra) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: false, error: 'No se encontró la OC en Confirmacion de CITAS CSS' };
    }

    sheet.getRange(rowIndex, 1, 1, 3).setValues([[
      toText_(data && data.fecha_confirmada),
      toText_(data && data.estado_cita),
      toText_(data && data.hora_confirmada)
    ]]);

    return { success: true, message: 'Cita actualizada exitosamente' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function createOutput_(payload, callback) {
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(payload) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeSourceRow_(src) {
  var out = [];
  for (var i = 0; i < src.length; i++) {
    var value = src[i];
    if (value instanceof Date) {
      out.push(formatDate_(value));
    } else if (typeof value === 'number') {
      out.push(value);
    } else {
      out.push(toText_(value));
    }
  }
  return out;
}

function buildFallbackSource_(data) {
  var src = new Array(27).fill('');
  src[1] = toText_(data.correo_solicitante || data.correo);
  src[2] = toText_(data.fecha_solicitada || data.fecha_entrega_solicitada);
  src[3] = toText_(data.fecha_vencimiento);
  src[4] = toText_(data.hora_solicitada);
  src[5] = toText_(data.nombre_proveedor);
  src[7] = toText_(data.numero_orden_compra);
  src[8] = toText_(data.codigo_referencia);
  src[9] = toText_(data.descripcion_producto);
  src[10] = toNumber_(data.cantidad_unidades);
  src[11] = toNumber_(data.cantidad_bultos);
  src[12] = toText_(data.unidad_empaque);
  src[13] = toNumber_(data.cantidad_pallets);
  src[14] = toText_(data.tipo_entrega);
  src[15] = toText_(data.tipo_ambiente);
  src[16] = toText_(data.area_correspondiente);
  src[17] = toText_(data.nombre_solicitante);
  src[18] = toText_(data.correo_solicitante || data.correo);
  src[19] = toText_(data.telefono);
  src[20] = toText_(data.tipo_unidad_movil);
  src[21] = toText_(data.personal_empresa_entrega);
  src[26] = toText_(data.anexo_lista_empaque);
  return src;
}

function formatDate_(value) {
  if (!value) return '';
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function toText_(value) {
  return String(value || '').trim();
}

function toNumber_(value) {
  var parsed = Number(value);
  return isNaN(parsed) ? 0 : parsed;
}
