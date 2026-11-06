'use strict';
// STL en la nube y modo "Modelo" del visor (pestaña Catálogo).
// Los STL se comprimen en el navegador (gzip) y se suben en pedazos de 1,8 MB a la base MODELOS del Worker.
// Lo que ya se bajó queda en la caché del navegador, así no se vuelve a descargar.
// Usa lo definido en app.js ($, config, conexion, api, conectado, leerJson, escribirJson)
// y en visor.js (visorPriv, modoVisor, usarEnLlavero, mostrarModelo, archivosVisor, coloresDisponibles).

const MODELO_KEY = 'calc3d.modelo.v1';
const PARTE_BYTES = 1_800_000;
const CACHE_MODELOS = 'calc3d-modelos-v1';

let nube = { modelos: [], usado: 0, limite: 500_000_000 };
let modeloActual = null; // { id|null, nombre, buffer }
let ultimoPedido = 0; // si tocás dos modelos seguidos, gana el último que tocaste
const estadoModelo = { modelo: null, ...leerJson(MODELO_KEY, {}) };

const mb = (b) => `${(b / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: b < 10_000_000 ? 1 : 0 })} MB`;

function estadoNube(texto, tipo = '') {
  $('#mEstado').textContent = texto;
  $('#mEstado').className = `estado ${tipo}`;
}

// ---------- Compresión ----------
async function pasarPorStream(datos, stream) {
  return new Response(new Blob([datos]).stream().pipeThrough(stream)).arrayBuffer();
}
const comprimir = (buf) => pasarPorStream(buf, new CompressionStream('gzip'));
const descomprimir = (buf) => pasarPorStream(buf, new DecompressionStream('gzip'));

// ---------- Pedidos binarios al Worker ----------
async function apiBinario(metodo, ruta, cuerpo) {
  const resp = await fetch(conexion.apiUrl.replace(/\/+$/, '') + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${conexion.apiToken}`, ...(cuerpo ? { 'Content-Type': 'application/octet-stream' } : {}) },
    body: cuerpo,
  });
  if (!resp.ok) {
    const datos = await resp.json().catch(() => ({}));
    throw new Error(datos.error || `Error ${resp.status}`);
  }
  return resp.arrayBuffer();
}

// ---------- Caché local ----------
async function cacheModelos() {
  try { return 'caches' in window ? await caches.open(CACHE_MODELOS) : null; } catch { return null; }
}
async function leerCache(id) {
  const c = await cacheModelos();
  const r = c && (await c.match(`/modelos/${id}`));
  return r ? r.arrayBuffer() : null;
}
async function guardarCache(id, gz) {
  try { await (await cacheModelos())?.put(`/modelos/${id}`, new Response(gz)); } catch { /* sin lugar: no pasa nada */ }
}
async function borrarCache(id) {
  try { await (await cacheModelos())?.delete(`/modelos/${id}`); } catch { /* nada */ }
}

// ---------- Subir y bajar ----------
async function subirModelo(archivo) {
  const buffer = await archivo.arrayBuffer();
  if (buffer.byteLength < 84) throw new Error('no parece un STL');
  estadoNube(`Comprimiendo ${archivo.name}…`);
  const gz = new Uint8Array(await comprimir(buffer));
  const partes = Math.ceil(gz.byteLength / PARTE_BYTES);
  if (nube.usado + gz.byteLength > nube.limite * 0.95) throw new Error('no queda espacio en la nube: borrá algún modelo');
  const nombre = archivo.name.replace(/\.stl$/i, '');
  const { id } = await api('POST', '/modelos', { nombre, bytes: buffer.byteLength, bytesGz: gz.byteLength, partes });
  try {
    for (let n = 0; n < partes; n++) {
      estadoNube(`Subiendo ${archivo.name}: ${Math.round((n / partes) * 100)}% (${mb(gz.byteLength)} comprimido)`);
      await apiBinario('PUT', `/modelos/${id}/${n}`, gz.subarray(n * PARTE_BYTES, (n + 1) * PARTE_BYTES));
    }
  } catch (e) {
    await api('DELETE', `/modelos/${id}`).catch(() => {});
    throw e;
  }
  await guardarCache(id, gz);
  return { id, nombre, buffer };
}

async function bajarModelo(m) {
  let gz = await leerCache(m.id);
  if (!gz) {
    const pedazos = [];
    for (let n = 0; n < m.partes; n++) {
      estadoNube(`Bajando ${m.nombre}: ${Math.round((n / m.partes) * 100)}%`);
      pedazos.push(await apiBinario('GET', `/modelos/${m.id}/${n}`));
    }
    gz = await new Blob(pedazos).arrayBuffer();
    await guardarCache(m.id, gz);
  }
  return descomprimir(gz);
}

// ---------- Lista ----------
async function renderNube() {
  const ul = $('#mLista');
  if (!conectado()) {
    ul.innerHTML = '<li class="vacio">Iniciá sesión para ver tus modelos en la nube.</li>';
    return;
  }
  try {
    nube = await api('GET', '/modelos');
  } catch (e) {
    estadoNube(`No se pudieron traer los modelos: ${e.message}`, 'error');
    return;
  }
  $('#mUso').textContent = `Usás ${mb(nube.usado)} de ${mb(nube.limite)} gratis. Subí solo los STL que quieras ver desde otro dispositivo; se guardan comprimidos.`;
  if (!nube.modelos.length) {
    ul.innerHTML = '<li class="vacio">Todavía no subiste ningún STL.</li>';
    return;
  }
  ul.replaceChildren(...nube.modelos.map((m) => {
    const li = document.createElement('li');
    li.classList.toggle('activo', modeloActual?.id === m.id);
    const info = document.createElement('div');
    info.className = 'info';
    const nombre = document.createElement('strong');
    nombre.textContent = m.nombre;
    const detalle = document.createElement('small');
    detalle.textContent = m.completo
      ? `${mb(m.bytes)} · ocupa ${mb(m.bytesGz)} · ${new Date(m.creado).toLocaleDateString('es-AR')}`
      : '⚠️ Subida incompleta: borralo y volvé a subirlo';
    info.append(nombre, detalle);
    const acciones = document.createElement('div');
    acciones.className = 'acciones';
    acciones.style.margin = '0';
    const boton = (texto, titulo, alClic, clase = 'btn small secondary') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = clase;
      b.textContent = texto;
      b.title = titulo;
      b.disabled = !m.completo && clase !== 'icon-btn';
      b.addEventListener('click', alClic);
      acciones.append(b);
    };
    if (modoVisor === 'llavero') {
      boton('Base', 'Usar como base con letras', () => abrirDeNube(m, 'base'));
      boton('Número', 'Usar como número o inserto', () => abrirDeNube(m, 'numero'));
    } else {
      boton('Ver', 'Ver en el visor', () => abrirDeNube(m));
    }
    boton('✎', 'Cambiar el nombre', () => renombrar(m), 'icon-btn');
    boton('✕', 'Borrar de la nube', () => borrarModelo(m), 'icon-btn');
    li.append(info, acciones);
    return li;
  }));
}

async function abrirDeNube(m, parteLlavero) {
  const pedido = ++ultimoPedido;
  try {
    const buffer = await bajarModelo(m);
    if (pedido !== ultimoPedido) return;
    if (parteLlavero) {
      await usarEnLlavero(parteLlavero, buffer, m.nombre);
      estadoNube('');
    } else {
      await verModelo({ id: m.id, nombre: m.nombre, buffer });
    }
  } catch (e) {
    estadoNube(`No se pudo abrir ${m.nombre}: ${e.message}`, 'error');
  }
}

async function renombrar(m) {
  const nuevo = prompt('Nuevo nombre del modelo', m.nombre)?.trim();
  if (!nuevo || nuevo === m.nombre) return;
  try {
    await api('PUT', `/modelos/${m.id}`, { nombre: nuevo });
    if (modeloActual?.id === m.id) {
      modeloActual.nombre = nuevo;
      $('#mInfo').textContent = $('#mInfo').textContent.replace(m.nombre, nuevo);
    }
    renderNube();
  } catch (e) { estadoNube(e.message, 'error'); }
}

async function borrarModelo(m) {
  if (!confirm(`¿Borrar "${m.nombre}" de la nube? El archivo de tu compu no se toca.`)) return;
  try {
    await api('DELETE', `/modelos/${m.id}`);
    await borrarCache(m.id);
    if (estadoModelo.ultimo === m.id) { delete estadoModelo.ultimo; guardarEstadoModelo(); }
    renderNube();
  } catch (e) { estadoNube(e.message, 'error'); }
}

async function subirArchivos(archivos) {
  if (!conectado()) { estadoNube('Iniciá sesión para subir modelos.', 'error'); return; }
  let ultimo = null;
  for (const archivo of archivos) {
    try {
      ultimo = await subirModelo(archivo);
      await renderNube();
    } catch (e) {
      estadoNube(`No se pudo subir ${archivo.name}: ${e.message}`, 'error');
      return;
    }
  }
  if (ultimo && modoVisor === 'modelo') await verModelo(ultimo);
  estadoNube(archivos.length > 1 ? `${archivos.length} modelos subidos.` : `${ultimo.nombre} subido a la nube.`, 'ok');
}

// ---------- Modo "Modelo" ----------
function guardarEstadoModelo() {
  escribirJson(MODELO_KEY, { modelo: estadoModelo.modelo, ultimo: estadoModelo.ultimo });
}

function renderPaletaModelo() {
  const lista = coloresDisponibles();
  if (!lista.some((c) => c.hex.toLowerCase() === (estadoModelo.modelo || '').toLowerCase())) {
    estadoModelo.modelo = lista[Math.min(3, lista.length - 1)].hex;
  }
  renderPaletasVisor($('#mPaleta'), lista, estadoModelo, () => {
    guardarEstadoModelo();
    visorPriv.pintar({ modelo: estadoModelo.modelo });
  }, [['modelo', 'Color']]);
}

async function verModelo(m) {
  modeloActual = m;
  await visorPriv.iniciar();
  visorPriv.cargarModelo(m.buffer);
  visorPriv.pintar({ modelo: estadoModelo.modelo });
  $('#vVacio').hidden = true;
  $('#vDescargar').disabled = false;
  $('#mBajarStl').disabled = false;
  $('#vCompartir').disabled = false;
  const d = visorPriv.medidas;
  const f = (v) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
  $('#mInfo').textContent = `${m.nombre}: ${f(d.x)} × ${f(d.y)} × ${f(d.z)} mm · ${Math.round(visorPriv.triangulos).toLocaleString('es-AR')} triángulos`;
  if (m.id) { estadoModelo.ultimo = m.id; guardarEstadoModelo(); }
  estadoNube('');
  renderNube();
}

/** "Ver en el visor" de una combinación de un link de modelo: abre ese modelo con el color elegido. */
async function verEleccionModelo(modeloId, hex) {
  estadoModelo.modelo = hex;
  guardarEstadoModelo();
  if (modoVisor !== 'modelo') await cambiarModo('modelo');
  const m = nube.modelos.find((x) => x.id === modeloId);
  if (m && modeloActual?.id !== modeloId) await abrirDeNube(m);
  else if (!m) estadoNube('Ese modelo ya no está en la nube.', 'error');
  renderPaletaModelo();
  visorPriv.pintar({ modelo: hex });
  document.querySelector('.visor').scrollIntoView({ behavior: 'smooth' });
}

function bajarStl() {
  if (!modeloActual) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([modeloActual.buffer], { type: 'model/stl' }));
  a.download = `${modeloActual.nombre}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ---------- Cambio de modo ----------
async function cambiarModo(modo) {
  modoVisor = modo;
  escribirJson('calc3d.visorModo', modo);
  document.querySelectorAll('.visor .modo').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modo === modo)));
  document.querySelector('.visor').dataset.modo = modo;
  $('#vCompartir').disabled = modo === 'llavero' ? !archivosVisor.base : !modeloActual;
  if (modo === 'llavero') {
    if (archivosVisor.base) await mostrarModelo();
    else { $('#vVacio').hidden = false; limpiarLienzo(); }
  } else if (modeloActual) {
    await verModelo(modeloActual);
  } else {
    $('#vVacio').hidden = false;
    $('#vDescargar').disabled = true;
    limpiarLienzo();
  }
  renderNube();
}

function limpiarLienzo() {
  if (!visorPriv.listo) return;
  for (const m of Object.values(visorPriv.mallas)) { visorPriv.escena.remove(m); m.geometry.dispose(); }
  visorPriv.mallas = {};
  visorPriv.centro = null;
  visorPriv.dibujar();
}

/** En modo modelo, la imagen (frente y dorso) se llama como el modelo. Lo llama visor.js. */
function descargarImagenModelo() {
  if (!modeloActual) return;
  const a = document.createElement('a');
  a.href = visorPriv.imagen();
  a.download = `${modeloActual.nombre}.png`;
  a.click();
}

document.querySelectorAll('.visor .modo').forEach((b) => b.addEventListener('click', () => cambiarModo(b.dataset.modo)));
$('#mSubir').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) subirArchivos(f); });
$('#mArchivoLocal').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  try { await verModelo({ id: null, nombre: archivo.name.replace(/\.stl$/i, ''), buffer: await archivo.arrayBuffer() }); } catch (err) { estadoNube(`No se pudo abrir: ${err.message}`, 'error'); }
});
$('#mBajarStl').addEventListener('click', bajarStl);
const renderColoresAntesDeModelos = renderColores;
renderColores = function () {
  renderColoresAntesDeModelos();
  renderPaletaModelo();
  if (modoVisor === 'modelo') visorPriv.pintar({ modelo: estadoModelo.modelo });
};

// ---------- Inicio ----------
(async function iniciarModelos() {
  renderPaletaModelo();
  await cambiarModo(modoVisor);
  await renderNube();
  // Vuelve a abrir el último modelo visto (de la caché, o de la nube si hace falta)
  const ultimo = nube.modelos.find((m) => m.id === estadoModelo.ultimo && m.completo);
  if (ultimo && modoVisor === 'modelo' && !modeloActual) abrirDeNube(ultimo);
})();
