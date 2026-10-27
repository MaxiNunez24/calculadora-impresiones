'use strict';
// Visor 3D compartido entre la calculadora (privada) y la página pública donde el cliente elige colores.
// Pinta un llavero en tres partes: base, letras (lo que está por encima de "altura") y número/inserto.

const THREE_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
];
const PARTES_VISOR = [['base', 'Base'], ['letras', 'Letras'], ['numero', 'Número']];

function cargarScriptVisor(src) {
  if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el visor 3D (¿hay conexión?)'));
    document.head.append(s);
  });
}

async function cargarThree() {
  for (const url of THREE_URLS) {
    if (url.includes('three.min') && window.THREE) continue;
    await cargarScriptVisor(url);
  }
}

const bufferABase64 = (buf) => {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
};
const base64ABuffer = (txt) => Uint8Array.from(atob(txt), (c) => c.charCodeAt(0)).buffer;

function muestraColor(hex) {
  const s = document.createElement('span');
  s.className = 'muestra';
  s.style.background = hex;
  return s;
}

class Visor3D {
  constructor(lienzo, fondo = '#eceef1') {
    this.lienzo = lienzo;
    this.fondo = fondo;
    this.mallas = {};
    this.listo = false;
  }

  async iniciar() {
    if (this.listo) return;
    await cargarThree();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.lienzo, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(this.fondo);
    this.escena.add(new THREE.AmbientLight(0xffffff, 0.55));
    const luz = new THREE.DirectionalLight(0xffffff, 0.75);
    luz.position.set(-0.4, -0.6, 1);
    this.escena.add(luz);
    const luz2 = new THREE.DirectionalLight(0xffffff, 0.35);
    luz2.position.set(0.3, 0.5, -1); // ilumina el dorso
    this.escena.add(luz2);
    this.camara = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
    this.camara.up.set(0, 0, 1); // en impresión 3D, Z es "arriba"
    this.controles = new THREE.OrbitControls(this.camara, this.lienzo);
    this.controles.addEventListener('change', () => this.dibujar());
    new ResizeObserver(() => this.ajustarTamano()).observe(this.lienzo);
    this.listo = true;
  }

  ajustarTamano() {
    const w = this.lienzo.clientWidth;
    const h = this.lienzo.clientHeight;
    if (!w || !h || !this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    if (this.centro) this.vista(this.ultimaVista || 'frente');
    else this.dibujar();
  }

  dibujar() {
    if (this.renderer) this.renderer.render(this.escena, this.camara);
  }

  /** base y numero: ArrayBuffer de STL. Separa la base en "base" y "letras" según la altura. */
  cargar({ base, numero, altura = 2 }) {
    for (const m of Object.values(this.mallas)) {
      this.escena.remove(m);
      m.geometry.dispose();
    }
    this.mallas = {};
    const loader = new THREE.STLLoader();
    const pos = loader.parse(base).getAttribute('position').array;
    const partes = { base: [], letras: [] };
    for (let i = 0; i < pos.length; i += 9) {
      const zc = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
      partes[zc > altura + 1e-3 ? 'letras' : 'base'].push(...pos.subarray(i, i + 9));
    }
    if (numero) partes.numero = Array.from(loader.parse(numero).getAttribute('position').array);
    const caja = new THREE.Box3();
    for (const [parte, p] of Object.entries(partes)) {
      if (!p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.computeVertexNormals();
      const malla = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0, side: THREE.DoubleSide }));
      this.mallas[parte] = malla;
      this.escena.add(malla);
      caja.expandByObject(malla);
    }
    this.centro = caja.getCenter(new THREE.Vector3());
    this.medidas = caja.getSize(new THREE.Vector3());
    this.vista('frente');
  }

  pintar(colores) {
    for (const [parte, hex] of Object.entries(colores)) this.mallas[parte]?.material.color.set(hex);
    this.dibujar();
  }

  vista(cual) {
    if (!this.centro) return;
    this.ultimaVista = cual;
    // Distancia para que entre el llavero entero, según el ancho y el alto del lienzo
    const m = this.medidas;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camara.fov / 2));
    const d = Math.max((m.x / 2) / (tanV * this.camara.aspect), (Math.max(m.y, m.z) / 2) / tanV) * 1.25;
    const c = this.centro;
    // Dorso: desde abajo y del otro lado, así el número (espejado en el modelo) se lee al derecho
    if (cual === 'frente') this.camara.position.set(c.x, c.y - d * 0.55, c.z + d * 0.85);
    else this.camara.position.set(c.x, c.y + d * 0.4, c.z - d * 0.9);
    this.camara.lookAt(c);
    this.controles.target.copy(c);
    this.controles.update();
    this.dibujar();
  }

  /** Imagen fija de 1200 px: frente arriba y dorso abajo (igual en el celular que en la PC). */
  imagen() {
    const w = 1200;
    const h = 460;
    const salida = document.createElement('canvas');
    salida.width = w;
    salida.height = h * 2;
    const ctx = salida.getContext('2d');
    const anterior = this.ultimaVista;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.vista('frente');
    ctx.drawImage(this.lienzo, 0, 0);
    this.vista('dorso');
    ctx.drawImage(this.lienzo, 0, h);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.ultimaVista = anterior;
    this.ajustarTamano();
    return salida.toDataURL('image/png');
  }
}

/**
 * Paletas para elegir un color por parte. estado = { base, letras, numero, numeroIgualLetras } con hex.
 * Llama a alCambiar(estado) cada vez que se elige algo.
 */
function renderPaletasVisor(contenedor, colores, estado, alCambiar, partes = PARTES_VISOR) {
  const hexDe = (parte) => (parte === 'numero' && estado.numeroIgualLetras ? estado.letras : estado[parte]);
  contenedor.replaceChildren(...partes.map(([parte, titulo]) => {
    const div = document.createElement('div');
    div.className = 'paleta';
    const h3 = document.createElement('h3');
    h3.textContent = titulo;
    const muestras = document.createElement('div');
    muestras.className = 'muestras';
    const bloqueado = parte === 'numero' && estado.numeroIgualLetras;
    muestras.append(...colores.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = c.detalle || c.nombre;
      b.setAttribute('aria-pressed', String((hexDe(parte) || '').toLowerCase() === c.hex.toLowerCase()));
      b.disabled = bloqueado;
      b.append(muestraColor(c.hex), c.nombre);
      b.addEventListener('click', () => {
        estado[parte] = c.hex;
        alCambiar(estado);
        renderPaletasVisor(contenedor, colores, estado, alCambiar, partes);
      });
      return b;
    }));
    div.append(h3, muestras);
    if (parte === 'numero') {
      const igual = document.createElement('label');
      igual.className = 'igual';
      igual.innerHTML = '<input type="checkbox"> Igual que las letras';
      const check = igual.querySelector('input');
      check.checked = Boolean(estado.numeroIgualLetras);
      check.addEventListener('change', () => {
        estado.numeroIgualLetras = check.checked;
        if (!check.checked && !estado.numero) estado.numero = estado.letras;
        alCambiar(estado);
        renderPaletasVisor(contenedor, colores, estado, alCambiar, partes);
      });
      div.append(igual);
    }
    return div;
  }));
}

/** Colores efectivos de cada parte (el número puede copiar a las letras). */
function coloresElegidos(estado) {
  return { base: estado.base, letras: estado.letras, numero: estado.numeroIgualLetras ? estado.letras : estado.numero };
}
