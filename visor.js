'use strict';
// Visualizador privado (pestaña Catálogo): carga los STL, prueba colores, descarga la imagen y
// crea links para que el cliente elija colores. El 3D vive en visor3d.js (compartido con elegir.html).
// Usa lo definido en app.js: $, config, api, conectado, money, leerJson, escribirJson, renderColores.

const VISOR_KEY = 'calc3d.visor.v1';
// Colores de respaldo si el catálogo todavía está vacío
const COLORES_BASICOS = [
  { nombre: 'Negro', hex: '#1C1C1C' }, { nombre: 'Blanco', hex: '#F4F4F4' }, { nombre: 'Gris', hex: '#9A9A9A' },
  { nombre: 'Verde', hex: '#7BD389' }, { nombre: 'Azul', hex: '#0086CD' },
];

const visorPriv = new Visor3D($('#vLienzo'));
const archivosVisor = { base: null, numero: null }; // ArrayBuffer de cada STL
let estadoVisor = { numeroIgualLetras: true };
let noOfrecidos = new Set(); // hex que no se ofrecen al cliente (por defecto se ofrecen todos)

// ---------- Colores ----------
function coloresDisponibles() {
  const lista = [];
  const vistos = new Set();
  for (const f of config.filamentos) {
    for (const c of f.colores) {
      const clave = `${c.nombre}|${c.hex.toLowerCase()}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lista.push({ nombre: c.nombre, hex: c.hex, detalle: `${f.nombre}${c.marca ? ` · ${c.marca}` : ''}` });
    }
  }
  return lista.length ? lista : COLORES_BASICOS.map((c) => ({ ...c, detalle: '' }));
}

/** Si un color elegido ya no está en el catálogo, se reemplaza por uno que sí. */
function asegurarEstado(lista) {
  const hay = (hex) => lista.some((c) => c.hex.toLowerCase() === (hex || '').toLowerCase());
  if (!hay(estadoVisor.base)) estadoVisor.base = lista[Math.min(3, lista.length - 1)].hex;
  if (!hay(estadoVisor.letras)) estadoVisor.letras = lista[0].hex;
  if (!hay(estadoVisor.numero)) estadoVisor.numero = estadoVisor.letras;
}

function guardarVisor() {
  const datos = {
    altura: Number($('#vAltura').value) || 2,
    estado: estadoVisor,
    noOfrecidos: [...noOfrecidos],
    titulo: $('#vTitulo').value,
    base: archivosVisor.base && bufferABase64(archivosVisor.base),
    numero: archivosVisor.numero && bufferABase64(archivosVisor.numero),
  };
  // Si los STL no entran en el almacenamiento del navegador, se guardan solo los colores
  if (!escribirJson(VISOR_KEY, datos)) escribirJson(VISOR_KEY, { ...datos, base: null, numero: null });
}

function renderPaletas() {
  const lista = coloresDisponibles();
  asegurarEstado(lista);
  const n = new Set(lista.map((c) => c.hex.toLowerCase())).size;
  $('#vCombinaciones').textContent = n > 1
    ? `Con tus ${n} colores: ${n * (n - 1)} combinaciones de dos colores y ${n * (n - 1) * (n - 1)} en total`
    : '';
  renderPaletasVisor($('#vPaletas'), lista, estadoVisor, () => {
    guardarVisor();
    visorPriv.pintar(coloresElegidos(estadoVisor));
  });
  renderOfrecer(lista);
}

// ---------- Modelo ----------
async function mostrarModelo() {
  await visorPriv.iniciar();
  visorPriv.cargar({ base: archivosVisor.base, numero: archivosVisor.numero, altura: Number($('#vAltura').value) || 2 });
  visorPriv.pintar(coloresElegidos(estadoVisor));
  $('#vVacio').hidden = true;
  $('#vDescargar').disabled = false;
  $('#vCompartir').disabled = false;
}

async function cargarArchivo(parte, archivo) {
  $('#vEstado').textContent = 'Cargando…';
  try {
    archivosVisor[parte] = await archivo.arrayBuffer();
    if (archivosVisor.base) await mostrarModelo();
    guardarVisor();
    $('#vEstado').textContent = `${archivo.name} cargado`;
  } catch (e) {
    $('#vEstado').textContent = `No se pudo cargar: ${e.message}`;
  }
}

function nombreDeHex(hex) {
  return coloresDisponibles().find((c) => c.hex.toLowerCase() === (hex || '').toLowerCase())?.nombre || hex;
}

function descargarImagenVisor() {
  const c = coloresElegidos(estadoVisor);
  const nombre = (hex) => nombreDeHex(hex).toLowerCase().replace(/\s+/g, '-');
  const a = document.createElement('a');
  a.href = visorPriv.imagen();
  a.download = `Llavero_base-${nombre(c.base)}_letras-${nombre(c.letras)}${visorPriv.mallas.numero ? `_numero-${nombre(c.numero)}` : ''}.png`;
  a.click();
}

// ---------- Compartir con un cliente ----------
function renderOfrecer(lista) {
  $('#vOfrecer').replaceChildren(...lista.map((c) => {
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !noOfrecidos.has(c.hex.toLowerCase());
    check.addEventListener('change', () => {
      if (check.checked) noOfrecidos.delete(c.hex.toLowerCase());
      else noOfrecidos.add(c.hex.toLowerCase());
      guardarVisor();
    });
    label.append(check, muestraColor(c.hex), c.nombre);
    return label;
  }));
}

function estadoCompartir(texto, tipo = '') {
  $('#vCompartirEstado').textContent = texto;
  $('#vCompartirEstado').className = `estado ${tipo}`;
}

const urlDeLink = (id) => new URL(`elegir.html#${id}`, location.href).href;

function mostrarLink(id, titulo) {
  const url = urlDeLink(id);
  $('#vLinkUrl').value = url;
  $('#vMandar').href = `https://wa.me/?text=${encodeURIComponent(`¡Hola! Acá podés probar y elegir los colores de "${titulo}": ${url}`)}`;
  $('#vLink').hidden = false;
}

async function crearLink() {
  if (!conectado()) { estadoCompartir('Iniciá sesión para crear links.', 'error'); return; }
  if (!archivosVisor.base) { estadoCompartir('Primero cargá el STL de la base.', 'error'); return; }
  const colores = coloresDisponibles().filter((c) => !noOfrecidos.has(c.hex.toLowerCase()))
    .map(({ nombre, hex }) => ({ nombre, hex }));
  if (colores.length < 2) { estadoCompartir('Tildá al menos dos colores.', 'error'); return; }
  const titulo = $('#vTitulo').value.trim() || 'Tu llavero';
  const boton = $('#vCompartir');
  boton.disabled = true;
  estadoCompartir('Creando link…');
  try {
    const { id } = await api('POST', '/compartidos', {
      titulo,
      negocio: config.nombreNegocio,
      whatsapp: config.contacto,
      altura: Number($('#vAltura').value) || 2,
      colores,
      base: bufferABase64(archivosVisor.base),
      numero: archivosVisor.numero ? bufferABase64(archivosVisor.numero) : null,
    });
    mostrarLink(id, titulo);
    estadoCompartir(`Link creado con ${colores.length} colores. Copialo o mandalo por WhatsApp.`, 'ok');
    renderLinks();
  } catch (e) {
    estadoCompartir(`No se pudo crear el link: ${e.message}`, 'error');
  } finally {
    boton.disabled = false;
  }
}

function describirEleccion(e) {
  const partes = [`base ${e.base.nombre}`, `letras ${e.letras.nombre}`];
  if (e.numero.hex !== e.letras.hex) partes.push(`número ${e.numero.nombre}`);
  return partes.join(', ');
}

async function renderLinks() {
  const ul = $('#vLinks');
  if (!conectado()) {
    ul.innerHTML = '<li class="vacio">Iniciá sesión para ver los links.</li>';
    return;
  }
  let lista;
  try {
    lista = await api('GET', '/compartidos');
  } catch (e) {
    ul.innerHTML = '';
    estadoCompartir(`No se pudieron traer los links: ${e.message}`, 'error');
    return;
  }
  if (!lista.length) {
    ul.innerHTML = '<li class="vacio">Todavía no compartiste ningún link.</li>';
    return;
  }
  ul.replaceChildren(...lista.map((l) => {
    const elecciones = l.elecciones || [];
    const ultima = elecciones.at(-1);
    const li = document.createElement('li');
    li.className = 'link-compartido';
    li.innerHTML = `
      <div class="info"><strong></strong><small></small></div>
      <div class="acciones" style="margin:0">
        <button type="button" class="btn small secondary" data-accion="copiar">Copiar link</button>
        <button type="button" class="icon-btn" data-accion="borrar" title="Borrar link">✕</button>
      </div>`;
    li.querySelector('strong').textContent = l.titulo;
    li.querySelector('small').textContent = `${new Date(l.creado).toLocaleDateString('es-AR')} · ` + (ultima
      ? `✅ ${ultima.nombre ? `${ultima.nombre} eligió` : 'Eligió'}: ${describirEleccion(ultima)}` +
        (elecciones.length > 1 ? ` (la última de ${elecciones.length})` : '')
      : '⏳ Esperando que elija');
    if (elecciones.length) {
      const detalle = document.createElement('details');
      detalle.className = 'gestionar';
      const resumen = document.createElement('summary');
      resumen.textContent = elecciones.length === 1 ? 'Ver la combinación' : `Ver las ${elecciones.length} combinaciones`;
      const sub = document.createElement('ul');
      sub.className = 'historial';
      sub.append(...[...elecciones].reverse().map((e) => {
        const item = document.createElement('li');
        const info = document.createElement('div');
        info.className = 'info';
        const trio = document.createElement('span');
        trio.className = 'trio';
        trio.append(...['base', 'letras', 'numero'].map((p) => muestraColor(e[p].hex)));
        const texto = document.createElement('small');
        const via = { whatsapp: ' · por WhatsApp', 'web y whatsapp': ' · web y WhatsApp' }[e.origen] || '';
        texto.textContent = `${describirEleccion(e)} · ${new Date(e.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}${via}` +
          (e.comentario ? ` · "${e.comentario}"` : '');
        info.append(trio, texto);
        const ver = document.createElement('button');
        ver.type = 'button';
        ver.className = 'btn small secondary';
        ver.textContent = 'Ver en el visor';
        ver.addEventListener('click', () => {
          estadoVisor = { base: e.base.hex, letras: e.letras.hex, numero: e.numero.hex, numeroIgualLetras: e.numero.hex === e.letras.hex };
          visorPriv.pintar(coloresElegidos(estadoVisor));
          renderPaletas();
          document.querySelector('.visor').scrollIntoView({ behavior: 'smooth' });
        });
        item.append(info, ver);
        return item;
      }));
      detalle.append(resumen, sub);
      li.append(detalle);
    }
    li.querySelector('[data-accion="copiar"]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(urlDeLink(l.id)); estadoCompartir('Link copiado.', 'ok'); } catch { mostrarLink(l.id, l.titulo); }
    });
    li.querySelector('[data-accion="borrar"]').addEventListener('click', async () => {
      if (!confirm(`¿Borrar el link "${l.titulo}"? El cliente ya no podrá abrirlo y se pierden sus combinaciones.`)) return;
      try { await api('DELETE', `/compartidos/${l.id}`); } catch (err) { estadoCompartir(err.message, 'error'); }
      renderLinks();
    });
    return li;
  }));
}

// ---------- Inicio ----------
async function restaurarVisor() {
  const datos = leerJson(VISOR_KEY, null);
  if (datos) {
    $('#vAltura').value = datos.altura || 2;
    $('#vTitulo').value = datos.titulo || '';
    noOfrecidos = new Set(datos.noOfrecidos || []);
    if (datos.estado) estadoVisor = datos.estado;
    else if (datos.elegidos) {
      // Versión anterior: guardaba "Nombre|#hex"
      const hex = (v) => (v || '').split('|')[1];
      estadoVisor = { base: hex(datos.elegidos.base), letras: hex(datos.elegidos.letras), numero: hex(datos.elegidos.numero), numeroIgualLetras: datos.numeroIgualLetras ?? true };
    }
  }
  renderPaletas();
  if (!datos?.base) return;
  try {
    archivosVisor.base = base64ABuffer(datos.base);
    if (datos.numero) archivosVisor.numero = base64ABuffer(datos.numero);
    await mostrarModelo();
    $('#vEstado').textContent = 'Último modelo cargado';
  } catch { /* sin conexión: se carga cuando haya */ }
}

$('#vArchivoBase').addEventListener('change', (e) => { if (e.target.files[0]) cargarArchivo('base', e.target.files[0]); e.target.value = ''; });
$('#vArchivoNumero').addEventListener('change', (e) => { if (e.target.files[0]) cargarArchivo('numero', e.target.files[0]); e.target.value = ''; });
$('#vAltura').addEventListener('change', () => { if (archivosVisor.base) mostrarModelo(); guardarVisor(); });
$('#vTitulo').addEventListener('change', guardarVisor);
document.querySelectorAll('.visor [data-vista]').forEach((b) => b.addEventListener('click', () => visorPriv.vista(b.dataset.vista)));
$('#vDescargar').addEventListener('click', descargarImagenVisor);
$('#vCompartir').addEventListener('click', crearLink);
$('#vCopiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#vLinkUrl').value); estadoCompartir('Link copiado.', 'ok'); } catch { $('#vLinkUrl').select(); }
});
$('#vActualizarLinks').addEventListener('click', renderLinks);
// Si cambian los colores del catálogo, se actualizan las paletas
const renderColoresAntesDelVisor = renderColores;
renderColores = function () {
  renderColoresAntesDelVisor();
  renderPaletas();
  visorPriv.pintar(coloresElegidos(estadoVisor));
};

restaurarVisor();
renderLinks();
