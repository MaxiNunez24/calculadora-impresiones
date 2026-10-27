'use strict';
// Visualizador de colores: carga el STL de la base (con letras) y el del número, pinta cada parte con
// los colores del catálogo y descarga una imagen con frente y dorso para mandarle al cliente.
// Usa lo definido en app.js: $, config, cargarScript, leerJson, escribirJson.

const THREE_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
];
const VISOR_KEY = 'calc3d.visor.v1';
// Colores de respaldo si el catálogo todavía está vacío
const COLORES_BASICOS = [
  { nombre: 'Negro', hex: '#1C1C1C' }, { nombre: 'Blanco', hex: '#F4F4F4' }, { nombre: 'Gris', hex: '#9A9A9A' },
  { nombre: 'Verde', hex: '#7BD389' }, { nombre: 'Azul', hex: '#0086CD' },
];
const PARTES = [['base', 'Base'], ['letras', 'Letras'], ['numero', 'Número']];

const visor = {
  listo: false, renderer: null, escena: null, camara: null, controles: null,
  archivos: { base: null, numero: null }, // ArrayBuffer de cada STL
  mallas: {}, elegidos: {}, numeroIgualLetras: true, centro: null, tamano: 1,
};

// ---------- Guardado del último modelo (en este dispositivo) ----------
const aBase64 = (buf) => {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
};
const deBase64 = (txt) => Uint8Array.from(atob(txt), (c) => c.charCodeAt(0)).buffer;

function guardarVisor() {
  const datos = {
    altura: Number($('#vAltura').value) || 2,
    elegidos: visor.elegidos,
    numeroIgualLetras: visor.numeroIgualLetras,
    base: visor.archivos.base && aBase64(visor.archivos.base),
    numero: visor.archivos.numero && aBase64(visor.archivos.numero),
  };
  if (!escribirJson(VISOR_KEY, datos)) {
    // Si los STL no entran en el almacenamiento del navegador, se guardan solo los colores
    escribirJson(VISOR_KEY, { ...datos, base: null, numero: null });
  }
}

// ---------- Colores ----------
function coloresDisponibles() {
  const lista = [];
  for (const f of config.filamentos) {
    for (const c of f.colores) lista.push({ nombre: c.nombre, hex: c.hex, detalle: `${f.nombre}${c.marca ? ` · ${c.marca}` : ''}` });
  }
  return lista.length ? lista : COLORES_BASICOS.map((c) => ({ ...c, detalle: '' }));
}
const claveDe = (c) => `${c.nombre}|${c.hex}`;

function colorDe(parte) {
  const lista = coloresDisponibles();
  const clave = parte === 'numero' && visor.numeroIgualLetras ? visor.elegidos.letras : visor.elegidos[parte];
  return lista.find((c) => claveDe(c) === clave) || lista[{ base: 3, letras: 0, numero: 0 }[parte] % lista.length];
}

function renderPaletas() {
  const lista = coloresDisponibles();
  const n = new Set(lista.map((c) => c.hex.toLowerCase())).size;
  $('#vCombinaciones').textContent = n > 1
    ? `Con tus ${n} colores: ${n * (n - 1)} combinaciones de dos colores y ${n * (n - 1) * (n - 1)} en total`
    : '';
  $('#vPaletas').replaceChildren(...PARTES.map(([parte, titulo]) => {
    const div = document.createElement('div');
    div.className = 'paleta';
    const h3 = document.createElement('h3');
    h3.textContent = titulo;
    const muestras = document.createElement('div');
    muestras.className = 'muestras';
    const bloqueado = parte === 'numero' && visor.numeroIgualLetras;
    const actual = claveDe(colorDe(parte));
    muestras.append(...lista.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = c.detalle || c.nombre;
      b.setAttribute('aria-pressed', String(claveDe(c) === actual));
      b.disabled = bloqueado;
      b.append(crearMuestra(c.hex), c.nombre);
      b.addEventListener('click', () => {
        visor.elegidos[parte] = claveDe(c);
        guardarVisor();
        aplicarColores();
        renderPaletas();
      });
      return b;
    }));
    div.append(h3, muestras);
    if (parte === 'numero') {
      const igual = document.createElement('label');
      igual.className = 'igual';
      igual.innerHTML = '<input type="checkbox"> Igual que las letras';
      const check = igual.querySelector('input');
      check.checked = visor.numeroIgualLetras;
      check.addEventListener('change', () => {
        visor.numeroIgualLetras = check.checked;
        if (!check.checked && !visor.elegidos.numero) visor.elegidos.numero = visor.elegidos.letras;
        guardarVisor();
        aplicarColores();
        renderPaletas();
      });
      div.append(igual);
    }
    return div;
  }));
}

function aplicarColores() {
  for (const [parte] of PARTES) visor.mallas[parte]?.material.color.set(colorDe(parte).hex);
  dibujar();
}

// ---------- Escena 3D ----------
async function iniciarThree() {
  if (visor.listo) return;
  for (const url of THREE_URLS) await cargarScript(url);
  const lienzo = $('#vLienzo');
  visor.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, preserveDrawingBuffer: true });
  visor.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  visor.escena = new THREE.Scene();
  visor.escena.background = new THREE.Color('#eceef1');
  visor.escena.add(new THREE.AmbientLight(0xffffff, 0.55));
  const luz = new THREE.DirectionalLight(0xffffff, 0.75);
  luz.position.set(-0.4, -0.6, 1);
  visor.escena.add(luz);
  const luz2 = new THREE.DirectionalLight(0xffffff, 0.35);
  luz2.position.set(0.3, 0.5, -1); // ilumina el dorso
  visor.escena.add(luz2);
  visor.camara = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
  visor.camara.up.set(0, 0, 1); // en impresión 3D, Z es "arriba"
  visor.controles = new THREE.OrbitControls(visor.camara, lienzo);
  visor.controles.enableDamping = false;
  visor.controles.addEventListener('change', dibujar);
  new ResizeObserver(ajustarTamano).observe(lienzo);
  visor.listo = true;
}

function ajustarTamano() {
  const lienzo = $('#vLienzo');
  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;
  if (!w || !h || !visor.renderer) return;
  visor.renderer.setSize(w, h, false);
  visor.camara.aspect = w / h;
  visor.camara.updateProjectionMatrix();
  dibujar();
}

function dibujar() {
  if (visor.renderer) visor.renderer.render(visor.escena, visor.camara);
}

function geometriaDe(posiciones) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  g.computeVertexNormals();
  return g;
}

/** Separa la base en "base" y "letras" según la altura de cada triángulo. */
function construirMallas() {
  for (const m of Object.values(visor.mallas)) {
    visor.escena.remove(m);
    m.geometry.dispose();
  }
  visor.mallas = {};
  if (!visor.archivos.base) return;
  const altura = Number($('#vAltura').value) || 2;
  const loader = new THREE.STLLoader();
  const pos = loader.parse(visor.archivos.base).getAttribute('position').array;
  const base = [];
  const letras = [];
  for (let i = 0; i < pos.length; i += 9) {
    const zc = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
    (zc > altura + 1e-3 ? letras : base).push(...pos.subarray(i, i + 9));
  }
  const partes = { base, letras };
  if (visor.archivos.numero) partes.numero = Array.from(loader.parse(visor.archivos.numero).getAttribute('position').array);
  const caja = new THREE.Box3();
  for (const [parte, p] of Object.entries(partes)) {
    if (!p.length) continue;
    const malla = new THREE.Mesh(geometriaDe(p), new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0, side: THREE.DoubleSide }));
    visor.mallas[parte] = malla;
    visor.escena.add(malla);
    caja.expandByObject(malla);
  }
  visor.centro = caja.getCenter(new THREE.Vector3());
  visor.medidas = caja.getSize(new THREE.Vector3());
  $('#vVacio').hidden = true;
  $('#vDescargar').disabled = false;
  aplicarColores();
  vista('frente');
}

function vista(cual) {
  if (!visor.centro) return;
  // Distancia para que entre el llavero entero, según el ancho y el alto del lienzo
  const m = visor.medidas;
  const tanV = Math.tan(THREE.MathUtils.degToRad(visor.camara.fov / 2));
  const tanH = tanV * visor.camara.aspect;
  const d = Math.max((m.x / 2) / tanH, (Math.max(m.y, m.z) / 2) / tanV) * 1.25;
  const c = visor.centro;
  // Frente: desde arriba, un poco inclinado. Dorso: desde abajo y del otro lado, así el número
  // (que está espejado en el modelo) se lee al derecho sin dar vuelta la cámara.
  if (cual === 'frente') visor.camara.position.set(c.x, c.y - d * 0.55, c.z + d * 0.85);
  else visor.camara.position.set(c.x, c.y + d * 0.4, c.z - d * 0.9);
  visor.camara.lookAt(c);
  visor.controles.target.copy(c);
  visor.controles.update();
  dibujar();
}

async function cargarArchivo(parte, archivo) {
  $('#vEstado').textContent = 'Cargando…';
  try {
    await iniciarThree();
    visor.archivos[parte] = await archivo.arrayBuffer();
    construirMallas();
    guardarVisor();
    $('#vEstado').textContent = `${archivo.name} cargado`;
  } catch (e) {
    $('#vEstado').textContent = `No se pudo cargar: ${e.message}`;
  }
}

// ---------- Imagen para el cliente: frente arriba, dorso abajo ----------
function nombreColor(parte) { return colorDe(parte).nombre.toLowerCase().replace(/\s+/g, '-'); }

function descargarImagen() {
  // Tamaño fijo y ancho, igual en el celular que en la PC
  const w = 1200;
  const h = 460;
  const lienzo = $('#vLienzo');
  const salida = document.createElement('canvas');
  salida.width = w;
  salida.height = h * 2;
  const ctx = salida.getContext('2d');
  const camara = visor.camara.position.clone();
  visor.renderer.setPixelRatio(1);
  visor.renderer.setSize(w, h, false);
  visor.camara.aspect = w / h;
  visor.camara.updateProjectionMatrix();
  vista('frente');
  ctx.drawImage(lienzo, 0, 0);
  vista('dorso');
  ctx.drawImage(lienzo, 0, h);
  // Volver al tamaño de la pantalla y a donde estaba mirando el usuario
  visor.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  ajustarTamano();
  visor.camara.position.copy(camara);
  visor.camara.lookAt(visor.centro);
  visor.controles.update();
  dibujar();
  const a = document.createElement('a');
  a.href = salida.toDataURL('image/png');
  const numero = visor.mallas.numero ? `_numero-${nombreColor('numero')}` : '';
  a.download = `Llavero_base-${nombreColor('base')}_letras-${nombreColor('letras')}${numero}.png`;
  a.click();
}

// ---------- Inicio ----------
async function restaurarVisor() {
  const datos = leerJson(VISOR_KEY, null);
  if (!datos) return;
  $('#vAltura').value = datos.altura || 2;
  visor.elegidos = datos.elegidos || {};
  visor.numeroIgualLetras = datos.numeroIgualLetras ?? true;
  renderPaletas();
  if (!datos.base) return;
  try {
    await iniciarThree();
    visor.archivos.base = deBase64(datos.base);
    if (datos.numero) visor.archivos.numero = deBase64(datos.numero);
    construirMallas();
    $('#vEstado').textContent = 'Último modelo cargado';
  } catch { /* sin conexión: se carga cuando haya */ }
}

$('#vArchivoBase').addEventListener('change', (e) => { if (e.target.files[0]) cargarArchivo('base', e.target.files[0]); e.target.value = ''; });
$('#vArchivoNumero').addEventListener('change', (e) => { if (e.target.files[0]) cargarArchivo('numero', e.target.files[0]); e.target.value = ''; });
$('#vAltura').addEventListener('change', () => { if (visor.listo) construirMallas(); guardarVisor(); });
document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => vista(b.dataset.vista)));
$('#vDescargar').addEventListener('click', descargarImagen);
// Si cambian los colores del catálogo, se actualizan las paletas
const renderColoresOriginal = renderColores;
renderColores = function () { renderColoresOriginal(); renderPaletas(); aplicarColores(); };

renderPaletas();
restaurarVisor();
