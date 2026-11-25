/* Código.gs · 25-nov-2026 · REEMPLAZO POR CEDIS (respaldo de lo agregado)
 * - entMezclarCedis_ y entCortesPorCedis_ (nuevas), antes de entVerificarPeriodos_.
 * - publicarEntradasJSON: la ingesta se hace antes de leer lo publicado; luego
 *   mz = entMezclarCedis_(ing, previo), obj = construirEntradasJSON_(ing), _meta.reemplazo,
 *   _meta.fuentesPorCedis y guardián por CEDIS (última recepción más vieja que la
 *   publicada por más de ENT_TOL_CORTE días: no se publica).
 * - construirEntradasJSON_: porCedis lleva el corte de cada CEDIS.
 * Reversión: quitar las dos funciones y volver a construir obj antes de leer lo publicado.
 */
function entMezclarCedis_(ing, previo) {
  var trae = {};
  ing.rows.forEach(function (r) { var k = r.cedis || 'PANAMA'; trae[k] = (trae[k] || 0) + 1; });
  var info = { reemplazados: Object.keys(trae).sort(), conservados: {} }, fuentes = {};
  Object.keys(trae).forEach(function (k) { fuentes[k] = { archivo: ing.archivo, modificado: ing.modificado, lineas: trae[k] }; });
  if (previo && previo.rows && previo.rows.length) {
    var fp = (previo._meta && previo._meta.fuentesPorCedis) || {};
    var quedan = previo.rows.filter(function (r) { return !trae[r.cedis || 'PANAMA']; });
    quedan.forEach(function (r) { var k = r.cedis || 'PANAMA'; info.conservados[k] = (info.conservados[k] || 0) + 1; });
    Object.keys(info.conservados).forEach(function (k) {
      var f = fp[k] || { archivo: (previo._meta && previo._meta.fuente) || '', modificado: (previo._meta && previo._meta.archivoModificado) || '' };
      fuentes[k] = { archivo: f.archivo, modificado: f.modificado, lineas: info.conservados[k], conservado: true };
    });
    ing.rows = ing.rows.concat(quedan);
  }
  return { info: info, fuentes: fuentes };
}
function entCortesPorCedis_(previo) {
  var o = {};
  if (previo && previo.rows) previo.rows.forEach(function (r) { var k = r.cedis || 'PANAMA'; if (r.fRec && r.fRec > (o[k] || '')) o[k] = r.fRec; });
  return o;
}
