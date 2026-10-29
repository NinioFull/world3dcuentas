// WORLD3D · Respaldo y resumen semanal del Manager (Google Apps Script, cuenta dueña del proyecto de Firebase)
// - respaldo(): copia la cola (trabajos, productos, impresoras, stock) a una hoja de cálculo nueva en Drive,
//   en la carpeta "WORLD3D · Respaldos del Manager". Guarda las últimas 8 y manda las viejas a la papelera.
// - resumen(): calcula cobrado, vendido, por cobrar y atrasados de la semana pasada y lo manda al Telegram del
//   negocio (función resumen-semanal de Supabase). Si Telegram falla, llega por correo.
// - avisos(): cada 5 minutos revisa si terminó una impresión y avisa por Telegram (una sola vez por trabajo).
// - instalar(): programa semanal() todos los lunes a las 8:00 (hora de Bolivia) y avisos() cada 5 minutos.
// La clave RESUMEN_SECRETO va en Configuración del proyecto > Propiedades del script.

const PROYECTO = 'printmanager-dae85';
const CARPETA = 'WORLD3D · Respaldos del Manager';
const GUARDAR = 8;
const FUNCION_TELEGRAM = 'https://swlmlwmjicsewwtudeah.supabase.co/functions/v1/resumen-semanal';
const CORREO = 'world3dbo@gmail.com';

function semanal() {
  let errores = [];
  let enlace = '';
  try { enlace = respaldo(); } catch (e) { errores.push('Respaldo: ' + e.message); }
  try { resumen(enlace, errores); } catch (e) { errores.push('Resumen: ' + e.message); }
  if (errores.length) MailApp.sendEmail(CORREO, 'WORLD3D · Problema con el respaldo semanal', errores.join('\n'));
}

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('semanal').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  ScriptApp.newTrigger('avisos').timeBased().everyMinutes(5).create();
}

// ── Telegram (función resumen-semanal de Supabase, mismo bot del sitio) ──
function telegram_(texto) {
  const secreto = PropertiesService.getScriptProperties().getProperty('RESUMEN_SECRETO');
  if (!secreto) return false;
  const r = UrlFetchApp.fetch(FUNCION_TELEGRAM, { method: 'post', contentType: 'application/json', headers: { 'x-resumen-secreto': secreto }, payload: JSON.stringify({ texto: texto }), muteHttpExceptions: true });
  return r.getResponseCode() === 200;
}

// ── Aviso de impresión terminada ──
// El contador vive en el Manager (runStart + remaining). Si ninguna pantalla está abierta, este script cierra el
// trabajo igual que el Manager (status done, finAuto = endedAt). Avisa una vez por cada trabajo que terminó solo.
function avisos() {
  const ahora = Date.now();
  const docs = consulta_('jobs', 'status', ['printing', 'done']);
  const props = PropertiesService.getScriptProperties();
  let avisados = {};
  try { avisados = JSON.parse(props.getProperty('AVISADOS') || '{}'); } catch (e) {}
  const terminados = [];
  docs.forEach(d => {
    const j = d.datos;
    if (j.jobType === 'design') return;
    if (j.status === 'printing') {
      const dur = num_(j.duration), resto = num_(j.remaining), inicio = num_(j.runStart);
      if (!dur || !inicio) return;
      if (resto - Math.floor((ahora - inicio) / 60000) > 0) return;
      const fin = inicio + resto * 60000;
      if (!cerrar_(d.nombre, d.updateTime, fin)) return;   // alguien lo cambió recién: se revisa en 5 min
      j.status = 'done'; j.endedAt = fin; j.finAuto = fin;
    }
    if (j.status === 'done' && j.finAuto && num_(j.finAuto) === num_(j.endedAt) && ahora - num_(j.endedAt) < 6 * 3600000 && avisados[j.id] !== num_(j.endedAt)) {
      terminados.push(j);
    }
  });
  if (!terminados.length) return;
  const impresoras = {}; leer_('printers').forEach(p => impresoras[p.id] = p.name || p.id);
  const cola = consulta_('jobs', 'status', ['pending']).map(d => d.datos).filter(j => j.jobType !== 'design');
  const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  terminados.forEach(j => {
    const sigue = cola.filter(x => x.printer === j.printer).sort((a, b) => num_(a.priority || a.createdAt) - num_(b.priority || b.createdAt))[0];
    const hora = Utilities.formatDate(new Date(num_(j.endedAt)), 'America/La_Paz', 'HH:mm');
    const texto = [
      '🖨 <b>Terminó: ' + esc(j.fileName) + '</b>' + (num_(j.quantity) > 1 ? ' (×' + num_(j.quantity) + ')' : ''),
      'En ' + esc(impresoras[j.printer] || 'la impresora') + ' a las ' + hora + (j.clientName ? ' · ' + esc(j.clientName) : ''),
      sigue ? '➡️ Sigue en esa impresora: ' + esc(sigue.fileName) : '✅ No hay nada más en cola para esa impresora',
    ].join('\n');
    if (telegram_(texto)) avisados[j.id] = num_(j.endedAt);
  });
  Object.keys(avisados).forEach(k => { if (ahora - avisados[k] > 2 * 86400000) delete avisados[k]; });
  props.setProperty('AVISADOS', JSON.stringify(avisados));
}

// Trabajos con un campo dentro de una lista de valores (runQuery). Devuelve nombre, updateTime y datos.
function consulta_(col, campo, valores) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents:runQuery';
  const cuerpo = { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'IN', value: { arrayValue: { values: valores.map(v => ({ stringValue: v })) } } } } } };
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo), headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROYECTO }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('consulta ' + col + ' (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText()).filter(x => x.document).map(x => {
    const d = x.document, o = { id: d.name.split('/').pop() };
    Object.keys(d.fields || {}).forEach(k => o[k] = valor_(d.fields[k]));
    return { nombre: d.name, updateTime: d.updateTime, datos: o };
  });
}

// Cierra un trabajo que terminó de imprimir, solo si nadie lo tocó desde que se leyó (updateTime)
function cerrar_(nombre, updateTime, fin) {
  const campos = ['status', 'endedAt', 'finAuto', 'remaining', 'runStart'];
  const url = 'https://firestore.googleapis.com/v1/' + nombre + '?' + campos.map(c => 'updateMask.fieldPaths=' + c).join('&') + '&currentDocument.updateTime=' + encodeURIComponent(updateTime);
  const cuerpo = { fields: { status: { stringValue: 'done' }, endedAt: { integerValue: String(fin) }, finAuto: { integerValue: String(fin) }, remaining: { integerValue: '0' }, runStart: { nullValue: null } } };
  const r = UrlFetchApp.fetch(url, { method: 'patch', contentType: 'application/json', payload: JSON.stringify(cuerpo), headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROYECTO }, muteHttpExceptions: true });
  return r.getResponseCode() === 200;
}

// ── Leer Firestore con la cuenta dueña del proyecto ──
function leer_(col) {
  let docs = [], pt = '';
  do {
    const url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents/' + col + '?pageSize=300' + (pt ? '&pageToken=' + encodeURIComponent(pt) : '');
    const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROYECTO }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error(col + ' (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 300));
    const j = JSON.parse(r.getContentText());
    docs = docs.concat(j.documents || []);
    pt = j.nextPageToken || '';
  } while (pt);
  return docs.map(d => { const o = { id: d.name.split('/').pop() }; Object.keys(d.fields || {}).forEach(k => o[k] = valor_(d.fields[k])); return o; });
}
function valor_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) { const o = {}; Object.keys(v.mapValue.fields || {}).forEach(k => o[k] = valor_(v.mapValue.fields[k])); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor_);
  return '';
}
const fecha_ = (ms) => (ms ? new Date(Number(ms)) : '');
const num_ = (x) => Number(x) || 0;

// ── Respaldo ──
function respaldo() {
  const jobs = leer_('jobs'), productos = leer_('products'), impresoras = leer_('printers'), stock = leer_('stock');
  const nombreImp = {}; impresoras.forEach(p => nombreImp[p.id] = p.name || p.id);
  const hoy = Utilities.formatDate(new Date(), 'America/La_Paz', 'yyyy-MM-dd');
  const ss = SpreadsheetApp.create('Respaldo Manager ' + hoy);

  const hoja = (nombre, cabecera, filas) => {
    const sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, cabecera.length).setValues([cabecera]).setFontWeight('bold').setBackground('#F1841B');
    if (filas.length) sh.getRange(2, 1, filas.length, cabecera.length).setValues(filas);
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, cabecera.length);
  };
  const trabajos = [...jobs].sort((a, b) => num_(b.createdAt) - num_(a.createdAt)).map(j => [
    j.fileName || '', j.status || '', j.jobType === 'design' ? 'Diseño' : 'Impresión', j.clientName || '', j.clientPhone || '',
    nombreImp[j.printer] || '', j.material || '', j.color || '', num_(j.quantity) || 1, num_(j.price), num_(j.deposit),
    fecha_(j.createdAt), fecha_(j.endedAt), fecha_(j.shippedAt), fecha_(j.deliveryAt), j.notes || '', j.webPedido || '', j.id,
  ]);
  hoja('Trabajos', ['Trabajo', 'Estado', 'Tipo', 'Cliente', 'Teléfono', 'Impresora', 'Material', 'Color', 'Cantidad', 'Precio Bs', 'Adelanto Bs', 'Creado', 'Terminado', 'Entregado', 'Entrega acordada', 'Notas', 'Pedido web', 'id'], trabajos);
  hoja('Productos', ['Producto', 'Categoría', 'Precio Bs', 'Duración (min)', 'Peso (g)', 'Material', 'Color', 'id'],
    productos.map(p => [p.name || '', p.category || '', num_(p.price), num_(p.duration), num_(p.weight), p.material || '', p.color || '', p.id]));
  hoja('Impresoras', ['Impresora', 'Marca', 'Tipo', 'Conectada', 'id'], impresoras.map(p => [p.name || '', p.brand || '', p.type || '', !!p.connected, p.id]));
  hoja('Stock', ['Producto', 'Cantidad', 'Material', 'Color', 'Precio Bs', 'id'], stock.map(s => [s.name || '', num_(s.qty), s.material || '', s.color || '', num_(s.price), s.id]));
  ss.deleteSheet(ss.getSheetByName('Hoja 1') || ss.getSheets()[0]);

  // Carpeta y limpieza: quedan las últimas GUARDAR copias
  const it = DriveApp.getFoldersByName(CARPETA);
  const carpeta = it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA);
  const archivo = DriveApp.getFileById(ss.getId());
  archivo.moveTo(carpeta);
  const copias = [];
  const fs = carpeta.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (fs.hasNext()) copias.push(fs.next());
  copias.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(GUARDAR).forEach(f => f.setTrashed(true));
  return ss.getUrl();
}

// ── Resumen de la semana pasada (lunes a domingo) ──
function resumen(enlace, errores) {
  const jobs = leer_('jobs');
  const ahora = new Date();
  const lunes = new Date(ahora); lunes.setHours(0, 0, 0, 0); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  const desde = lunes.getTime() - 7 * 86400000, hasta = lunes.getTime();
  const enRango = (t) => num_(t) >= desde && num_(t) < hasta;
  const bs = (n) => 'Bs ' + Math.round(n).toLocaleString('es-BO');

  let cobrado = 0;
  jobs.forEach(j => {
    const precio = num_(j.price), adel = Math.min(num_(j.deposit), precio || Infinity);
    if (adel > 0 && enRango(j.createdAt)) cobrado += adel;
    if (j.status === 'shipped' && !j.debe && precio > adel && enRango(j.saldoCobradoAt || j.shippedAt || j.endedAt || j.createdAt)) cobrado += precio - adel;
  });
  const pedidos = jobs.filter(j => enRango(j.createdAt));
  const vendido = pedidos.reduce((s, j) => s + num_(j.price), 0);
  const entregados = jobs.filter(j => j.status === 'shipped' && enRango(j.shippedAt));
  const saldo = (j) => Math.max(0, num_(j.price) - num_(j.deposit));
  const porCobrar = jobs.filter(j => j.status !== 'shipped' || j.debe).reduce((s, j) => s + saldo(j), 0);
  const deben = jobs.filter(j => j.status === 'shipped' && j.debe && saldo(j) > 0);
  const sinRecoger = jobs.filter(j => ['done', 'shipping'].includes(j.status) && j.jobType !== 'design' && j.endedAt && Date.now() - num_(j.endedAt) > 3 * 86400000);
  const atrasados = jobs.filter(j => ['pending', 'printing', 'paused'].includes(j.status) && j.deliveryAt && num_(j.deliveryAt) < Date.now());
  const enCola = jobs.filter(j => ['pending', 'printing', 'paused'].includes(j.status));
  const listos = jobs.filter(j => ['done', 'shipping'].includes(j.status));
  const cuenta = {}; pedidos.forEach(j => { const n = (j.fileName || '').trim(); if (n) cuenta[n] = (cuenta[n] || 0) + (num_(j.quantity) || 1); });
  const top = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]).slice(0, 3);
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (d) => Utilities.formatDate(d, 'America/La_Paz', 'dd/MM');

  const lineas = [
    '<b>WORLD3D · Semana ' + fmt(new Date(desde)) + ' al ' + fmt(new Date(hasta - 1)) + '</b>',
    '',
    '💰 Cobrado: <b>' + bs(cobrado) + '</b>',
    '🧾 Vendido: ' + bs(vendido) + ' (' + pedidos.length + ' pedidos)',
    '🚚 Entregados: ' + entregados.length,
    '⏳ Por cobrar (incluye lo que quedó debiendo): ' + bs(porCobrar),
    '',
    '🖨 En cola o imprimiendo: ' + enCola.length + ' · 📦 Listos para entregar: ' + listos.length,
    atrasados.length ? '⚠️ Atrasados: ' + atrasados.length + ' — ' + esc(atrasados.slice(0, 5).map(j => j.fileName + (j.clientName ? ' (' + j.clientName + ')' : '')).join(', ')) : '✅ Nada atrasado',
  ];
  if (deben.length) lineas.push('💸 Te deben: ' + bs(deben.reduce((s, j) => s + saldo(j), 0)) + ' — ' + esc(deben.slice(0, 5).map(j => j.clientName || j.fileName).join(', ')));
  if (sinRecoger.length) lineas.push('📦 Listos hace más de 3 días sin recoger: ' + sinRecoger.length + ' — ' + esc(sinRecoger.slice(0, 5).map(j => j.fileName + (j.clientName ? ' (' + j.clientName + ')' : '')).join(', ')));
  if (top.length) lineas.push('', '🏆 Lo más pedido: ' + esc(top.map(n => n + ' ×' + cuenta[n]).join(', ')));
  if (enlace) lineas.push('', '🗂 Respaldo de la cola: ' + enlace);
  if (errores && errores.length) lineas.push('', '⚠️ ' + esc(errores.join(' · ')));
  const texto = lineas.join('\n');

  const ok = telegram_(texto);
  if (!ok && errores) errores.push('No se pudo mandar el resumen por Telegram');
  if (!ok) MailApp.sendEmail({ to: CORREO, subject: 'WORLD3D · Resumen semanal', htmlBody: texto.replace(/\n/g, '<br>') });
  return texto;
}
