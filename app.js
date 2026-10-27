'use strict';

const STORAGE_KEY = 'calc3d.config.v1';
const HISTORIAL_KEY = 'calc3d.historial.v1';
const CONEXION_KEY = 'calc3d.conexion.v1';
const PRECIOS_KEY = 'calc3d.precios.v1';
const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

const COLORES_CONOCIDOS = {
  negro: '#1c1c1c', blanco: '#f5f5f5', gris: '#8a8f98', rojo: '#d32f2f', azul: '#1e5bd8', celeste: '#4fc3f7',
  verde: '#2e9d4a', amarillo: '#f7d117', naranja: '#f57c00', violeta: '#7b3fb5', lila: '#b39ddb', rosa: '#f06292',
  marrón: '#795548', marron: '#795548', dorado: '#c9a227', oro: '#c9a227', plateado: '#c0c0c0', plata: '#c0c0c0',
  cobre: '#b87333', transparente: '#e8f4f4', natural: '#efe8d8', piel: '#f1c8a5', bordo: '#7b1f2e',
};

const DEFAULTS = {
  version: 5,
  actualizado: null,
  nombreNegocio: '',
  contacto: '',
  validezDias: 7,
  senaPct: 50,
  valorImpresora: 500000,
  vidaUtilHoras: 5000,
  mantenimientoHora: 15,
  consumoRaspberryW: 5,
  tarifaKwh: 200,
  tarifaDisenoHora: 5000,
  fallasPct: 10,
  gananciaPct: 30,
  redondeo: 100,
  escalas: [
    { desde: 10, descuento: 10 },
    { desde: 25, descuento: 15 },
    { desde: 50, descuento: 20 },
  ],
  // printalotId: producto de printalot.com.ar del que se toma el precio
  filamentos: [
    { id: 'pla', nombre: 'PLA', printalotId: 37272, precioRollo: 21000, pesoRollo: 1000, consumoW: 80, colores: [] },
    { id: 'petg', nombre: 'PETG', printalotId: 37241, precioRollo: 21000, pesoRollo: 1000, consumoW: 120, colores: [] },
    { id: 'silk', nombre: 'PLA Silk', printalotId: 37325, precioRollo: 21000, pesoRollo: 1000, consumoW: 80, colores: [] },
    { id: 'flex', nombre: 'PLA Flex', printalotId: 37328, precioRollo: 21000, pesoRollo: 1000, consumoW: 85, colores: [] },
  ],
  // Impresora térmica (Q15)
  termica: {
    valorImpresora: 70000,
    vidaUtilImpresiones: 4000,
    papeles: [
      { id: 'termico', nombre: 'Térmico 57 mm', precioRollo: 1000, largoRolloCm: 300 },
      { id: 'adhesivo', nombre: 'Adhesivo 57 mm', precioRollo: 1000, largoRolloCm: 300 },
    ],
    // largoCm: papel que gasta cada impresión, con márgenes
    productos: [
      { id: 'simple', nombre: '1 impresión', impresiones: 1, precio: 100, largoCm: 10, papelId: 'termico' },
      { id: 'promo2', nombre: '2 impresiones', impresiones: 2, precio: 150, largoCm: 10, papelId: 'termico' },
      { id: 'sticker', nombre: 'Sticker', impresiones: 1, precio: 150, largoCm: 10, papelId: 'adhesivo' },
      { id: 'sticker2', nombre: '2 stickers', impresiones: 2, precio: 200, largoCm: 10, papelId: 'adhesivo' },
    ],
  },
};

const $ = (sel) => document.querySelector(sel);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const numOrNull = (v) => (v === '' || !Number.isFinite(+v) ? null : +v);
const dec = (n) => (+n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const fechaHora = (iso) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

function leerJson(clave, porDefecto) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
}
function escribirJson(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch { return false; }
}

function hexDeNombre(nombre) {
  const n = nombre.trim().toLowerCase();
  for (const [clave, hex] of Object.entries(COLORES_CONOCIDOS)) if (n.includes(clave)) return hex;
  return '#9e9e9e';
}

// Identifica un color dentro de un filamento: el mismo nombre puede repetirse en distintas marcas
const claveColor = (c) => (c.marca ? `${c.nombre} · ${c.marca}` : c.nombre);

// ---------- Nombres para un tono (escáner) ----------
const PALETA = [
  ['Negro', '#1a1a1a'], ['Gris oscuro', '#4a4a4a'], ['Gris', '#8a8a8a'], ['Gris claro', '#c4c4c4'], ['Blanco', '#f4f4f4'],
  ['Beige', '#e8d9b5'], ['Piel', '#f1c8a5'], ['Marrón', '#6d4c33'], ['Chocolate', '#4e342e'], ['Bordó', '#7b1f2e'],
  ['Rojo', '#d32f2f'], ['Rosa', '#f48fb1'], ['Fucsia', '#e91e8c'], ['Naranja', '#f57c00'], ['Amarillo', '#fdd835'],
  ['Dorado', '#c9a227'], ['Verde lima', '#9ccc3c'], ['Verde', '#2e9d4a'], ['Verde oscuro', '#1b5e20'], ['Turquesa', '#26a69a'],
  ['Celeste', '#4fc3f7'], ['Azul', '#1e5bd8'], ['Azul marino', '#1a237e'], ['Violeta', '#7b3fb5'], ['Lila', '#b39ddb'],
];

const hexARgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbAHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

function rgbALab([r, g, b]) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function distanciaColor(hexA, hexB) {
  const a = rgbALab(hexARgb(hexA));
  const b = rgbALab(hexARgb(hexB));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function nombreDeHex(hex) {
  return PALETA.reduce((mejor, [nombre, h]) => {
    const d = distanciaColor(hex, h);
    return d < mejor.d ? { nombre, d } : mejor;
  }, { nombre: 'Color', d: Infinity }).nombre;
}

// ---------- Configuración ----------
function migrarConfig(saved) {
  const cfg = { ...structuredClone(DEFAULTS), ...structuredClone(saved) };
  if ((saved.version || 1) < 2) {
    // v1 solo tenía PLA
    for (const f of DEFAULTS.filamentos) {
      if (!cfg.filamentos.some((x) => x.id === f.id)) cfg.filamentos.push(structuredClone(f));
    }
  }
  for (const f of cfg.filamentos) {
    // v2 guardaba los colores como texto separado por comas
    if (typeof f.colores === 'string') {
      f.colores = f.colores.split(',').map((s) => s.trim()).filter(Boolean).map((nombre) => ({ nombre, hex: hexDeNombre(nombre) }));
    }
    f.colores ??= [];
    if (f.printalotId === undefined) f.printalotId = DEFAULTS.filamentos.find((d) => d.id === f.id)?.printalotId ?? null;
  }
  // v4 agregó la impresora térmica
  cfg.termica = { ...structuredClone(DEFAULTS.termica), ...(saved.termica ? structuredClone(saved.termica) : {}) };
  // v5 agregó la promo de 2 stickers (solo si no estaba, para no pisar lo que ya editaste)
  if ((saved.version || 1) < 5 && !cfg.termica.productos.some((x) => x.id === 'sticker2')) {
    cfg.termica.productos.push(structuredClone(DEFAULTS.termica.productos.find((x) => x.id === 'sticker2')));
  }
  cfg.version = DEFAULTS.version;
  return cfg;
}

function loadConfig() {
  const saved = leerJson(STORAGE_KEY, null);
  if (saved && Array.isArray(saved.filamentos) && saved.filamentos.length) return migrarConfig(saved);
  return structuredClone(DEFAULTS);
}

function saveConfig({ marcar = true } = {}) {
  if (marcar) config.actualizado = new Date().toISOString();
  escribirJson(STORAGE_KEY, config);
  if (marcar) programarSubidaConfig();
}

let config = loadConfig();

// ---------- Nube (Cloudflare Worker) y sesión ----------
const API_POR_DEFECTO = 'https://calculadora-3d-api.maxinunez434.workers.dev';
let conexion = leerJson(CONEXION_KEY, { apiUrl: API_POR_DEFECTO, apiToken: '' });
const conectado = () => Boolean(conexion.apiUrl && conexion.apiToken);

async function api(metodo, ruta, cuerpo) {
  const resp = await fetch(conexion.apiUrl.replace(/\/+$/, '') + ruta, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${conexion.apiToken}`,
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = new Error(datos.error || `Error ${resp.status}`);
    error.status = resp.status;
    // Si la contraseña cambió (por ejemplo, rotaste el token), se vuelve a pedir
    if (resp.status === 401 && !document.body.classList.contains('bloqueado')) {
      cerrarSesion('Tu contraseña cambió o ya no es válida. Ingresala de nuevo.');
    }
    throw error;
  }
  return datos;
}

function mostrarBloqueo(mensaje = '') {
  document.body.classList.add('bloqueado');
  $('#ingresoError').textContent = mensaje;
  $('#ingresoUrl').value = conexion.apiUrl || API_POR_DEFECTO;
  setTimeout(() => $('#ingresoToken').focus());
}

function desbloquear() {
  document.body.classList.remove('bloqueado');
  $('#sesionUrl').textContent = conexion.apiUrl;
}

function cerrarSesion(mensaje = '') {
  conexion = { apiUrl: conexion.apiUrl, apiToken: '' };
  escribirJson(CONEXION_KEY, conexion);
  marcarNube(null);
  mostrarBloqueo(mensaje);
}

async function ingresar(e) {
  e.preventDefault();
  const anterior = conexion;
  conexion = { apiUrl: $('#ingresoUrl').value.trim() || API_POR_DEFECTO, apiToken: $('#ingresoToken').value.trim() };
  const boton = $('#botonIngreso');
  boton.disabled = true;
  $('#ingresoError').textContent = '';
  try {
    // Valida la contraseña y sube lo que se haya guardado en este navegador sin sesión
    const remotos = new Set((await api('GET', '/evaluaciones')).map((ev) => ev.id));
    const pendientes = leerJson(HISTORIAL_KEY, []).filter((ev) => !remotos.has(ev.id));
    for (const ev of pendientes) await api('PUT', `/evaluaciones/${encodeURIComponent(ev.id)}`, ev);
    escribirJson(CONEXION_KEY, conexion);
    desbloquear();
    await sincronizarInicio();
  } catch (err) {
    conexion = anterior;
    $('#ingresoError').textContent = err.status === 401
      ? 'Contraseña incorrecta.'
      : `No se pudo conectar con el Worker: ${err.message}`;
  } finally {
    boton.disabled = false;
  }
}

function marcarNube(estado, detalle = '') {
  const el = $('#estadoNube');
  el.hidden = !estado;
  el.textContent = estado === 'ok' ? '· ☁ sincronizado' : '· ⚠ sin conexión';
  el.title = detalle;
}

function estadoConexion(texto, tipo = '') {
  const el = $('#estadoConexion');
  el.textContent = texto;
  el.className = `estado ${tipo}`;
}

let timerSubida;
function programarSubidaConfig() {
  if (!conectado()) return;
  clearTimeout(timerSubida);
  timerSubida = setTimeout(async () => {
    try {
      await api('PUT', '/config', { datos: config, actualizado: config.actualizado });
      marcarNube('ok');
    } catch (e) {
      marcarNube('error', e.message);
    }
  }, 1500);
}

async function sincronizarInicio() {
  if (!conectado()) return;
  try {
    const remoto = await api('GET', '/config');
    if (remoto.datos && (!config.actualizado || remoto.actualizado > config.actualizado)) {
      config = migrarConfig(remoto.datos);
      config.actualizado = remoto.actualizado;
      saveConfig({ marcar: false });
      renderTodo();
    } else if (config.actualizado && config.actualizado !== remoto.actualizado) {
      await api('PUT', '/config', { datos: config, actualizado: config.actualizado });
    }
    recibirPrecios(await api('GET', '/precios'));
    renderEditorColores(); // muestra los botones "Importar de PrintALot"
    marcarNube('ok');
    estadoConexion('Conectado ✓', 'ok');
  } catch (e) {
    marcarNube('error', e.message);
    estadoConexion(`Sin conexión con el Worker: ${e.message}`, 'error');
  } finally {
    renderHistorial();
    if (typeof sincronizarTermica === 'function') sincronizarTermica(); // termica.js
    if (typeof renderLinks === 'function') renderLinks(); // visor.js
  }
}

// ---------- Precios de PrintALot ----------
let precios = leerJson(PRECIOS_KEY, { actualizado: null, productos: [] });

function aplicarPrecios() {
  let cambiados = 0;
  for (const f of config.filamentos) {
    const p = precios.productos.find((x) => x.id === f.printalotId);
    if (p && (f.precioRollo !== p.precio || f.pesoRollo !== p.pesoG)) {
      f.precioRollo = p.precio;
      f.pesoRollo = p.pesoG;
      cambiados++;
    }
  }
  if (cambiados) saveConfig();
  return cambiados;
}

function recibirPrecios(datos, mensajeExtra = '') {
  precios = { actualizado: datos.actualizado, productos: datos.productos || [] };
  escribirJson(PRECIOS_KEY, precios);
  const cambiados = aplicarPrecios();
  renderEstadoPrecios(cambiados, mensajeExtra);
  renderTablasConfig();
  renderSelectFilamentos();
  renderResultado();
}

function renderEstadoPrecios(cambiados = 0, extra = '') {
  const el = $('#estadoPrecios');
  if (!conectado() && !precios.actualizado) {
    el.textContent = 'Iniciá sesión para traer los precios de PrintALot.';
    el.className = 'estado';
    return;
  }
  const partes = [precios.actualizado ? `Precios de PrintALot del ${fechaHora(precios.actualizado)}` : 'Todavía no se trajeron precios'];
  if (cambiados) partes.push(`se actualizaron ${cambiados} filamento${cambiados > 1 ? 's' : ''}`);
  if (extra) partes.push(extra);
  el.textContent = partes.join(' · ');
  el.className = `estado ${cambiados ? 'ok' : ''}`;
}

async function actualizarPreciosAhora() {
  if (!conectado()) { renderEstadoPrecios(); return; }
  const boton = $('#actualizarPrecios');
  boton.disabled = true;
  try {
    const datos = await api('POST', '/precios/actualizar');
    recibirPrecios(datos, datos.cacheado ? 'ya se habían actualizado hace minutos' : '');
  } catch (e) {
    $('#estadoPrecios').textContent = `No se pudieron actualizar: ${e.message}`;
    $('#estadoPrecios').className = 'estado error';
  } finally {
    boton.disabled = false;
  }
}

// ---------- Historial ----------
// Con el Worker conectado la nube manda; localStorage queda como copia para usar sin conexión.
const historial = {
  async listar() {
    if (conectado()) {
      try {
        const lista = await api('GET', '/evaluaciones');
        escribirJson(HISTORIAL_KEY, lista);
        return lista;
      } catch (e) {
        marcarNube('error', e.message);
      }
    }
    return leerJson(HISTORIAL_KEY, []);
  },
  async guardar(entrada) {
    escribirJson(HISTORIAL_KEY, [entrada, ...leerJson(HISTORIAL_KEY, [])]);
    if (conectado()) await api('PUT', `/evaluaciones/${encodeURIComponent(entrada.id)}`, entrada);
  },
  async actualizar(entrada) {
    escribirJson(HISTORIAL_KEY, leerJson(HISTORIAL_KEY, []).map((e) => (e.id === entrada.id ? entrada : e)));
    if (conectado()) await api('PUT', `/evaluaciones/${encodeURIComponent(entrada.id)}`, entrada);
  },
  async borrar(id) {
    escribirJson(HISTORIAL_KEY, leerJson(HISTORIAL_KEY, []).filter((e) => e.id !== id));
    if (conectado()) await api('DELETE', `/evaluaciones/${encodeURIComponent(id)}`);
  },
};

// ---------- Cálculo ----------
function roundUp(value, step) {
  return step > 0 ? Math.ceil(value / step) * step : Math.round(value);
}

/** Seña redondeada a $100. La usan el presupuesto y Finanzas, para que coincidan. */
function montoSena(total, pct) {
  return pct > 0 ? Math.min(total, Math.round((total * pct) / 100 / 100) * 100) : 0;
}

function descuentoEscala(cfg, cantidad) {
  return cfg.escalas
    .filter((e) => e.desde > 0 && cantidad >= e.desde)
    .reduce((max, e) => Math.max(max, e.descuento), 0);
}

function calcular(cfg, t) {
  const fil = cfg.filamentos.find((f) => f.id === t.filamentoId) || cfg.filamentos[0];
  const cantidad = Math.max(1, Math.round(t.cantidad) || 1);
  // Peso y tiempo pueden cargarse de una unidad (se multiplican) o de toda la tanda
  const factor = t.porUnidad ? cantidad : 1;
  const gramos = t.gramos * factor;
  const horas = (t.horas + t.minutos / 60) * factor;

  const material = fil.pesoRollo > 0 ? (gramos * fil.precioRollo) / fil.pesoRollo : 0;
  const kw = (fil.consumoW + cfg.consumoRaspberryW) / 1000;
  const electricidad = kw * horas * cfg.tarifaKwh;
  const amortizacion = cfg.vidaUtilHoras > 0 ? (horas * cfg.valorImpresora) / cfg.vidaUtilHoras : 0;
  const mantenimiento = horas * cfg.mantenimientoHora;
  const fallas = (material + electricidad + amortizacion + mantenimiento) * cfg.fallasPct / 100;
  const otros = t.otros * factor;
  const diseno = t.horasDiseno * cfg.tarifaDisenoHora;
  const disenoCobrado = t.bonificarDiseno ? 0 : diseno;

  const produccion = material + electricidad + amortizacion + mantenimiento + fallas + otros;
  const costoTotal = produccion + diseno;

  // 1) Ganancia sobre el costo de producción. El diseño no lleva ganancia extra:
  //    se cobra a tu tarifa por hora, que ya es tu pago por ese tiempo.
  const gananciaPct = Math.max(0, t.ganancia ?? cfg.gananciaPct); // la del pedido, o la de Configuración
  const gananciaPlaneada = produccion * gananciaPct / 100;
  const precioProduccion = produccion + gananciaPlaneada;
  // 2) Precio por unidad: automático (redondeado hacia arriba) o el que escribas a mano
  const sugeridoUnidad = roundUp(precioProduccion / cantidad, cfg.redondeo);
  const listaUnidad = t.precioManual ?? sugeridoUnidad;
  const subtotalPiezas = listaUnidad * cantidad;
  // 3) Subtotal = piezas + diseño (si no está bonificado)
  const subtotal = subtotalPiezas + disenoCobrado;
  // 4) Descuento sobre el total; el resultado se redondea hacia arriba sin pasarse del subtotal
  const descuentoSugerido = descuentoEscala(cfg, cantidad);
  const descuentoPct = Math.min(100, Math.max(0, t.descuento ?? descuentoSugerido));
  const total = descuentoPct > 0 ? Math.min(subtotal, roundUp(subtotal * (1 - descuentoPct / 100), cfg.redondeo)) : subtotal;
  const descuentoMonto = subtotal - total;
  const ganancia = total - costoTotal;
  // 5) Seña para confirmar el pedido (la de Ajustes o la de este pedido)
  const senaPct = Math.min(100, Math.max(0, t.senaPct ?? cfg.senaPct ?? 0));
  const senaMonto = montoSena(total, senaPct);

  const kwh = kw * horas;
  const precioGramo = fil.pesoRollo > 0 ? fil.precioRollo / fil.pesoRollo : 0;
  const hs = horas.toLocaleString('es-AR', { maximumFractionDigits: 2 });

  return {
    filamento: fil,
    horas,
    gramos,
    cantidad,
    lineas: [
      { nombre: 'Material', valor: material, detalle: `${t.porUnidad ? `${dec(t.gramos)} g × ${cantidad} u. = ${dec(gramos)} g` : `${dec(t.gramos)} g`} × ${money.format(precioGramo)}/g (${money.format(fil.precioRollo)} el rollo de ${fil.pesoRollo} g)`, fija: true },
      { nombre: 'Electricidad', valor: electricidad, detalle: `(${fil.consumoW} W impresora + ${cfg.consumoRaspberryW} W Raspberry) × ${hs} h = ${dec(kwh)} kWh × ${money.format(cfg.tarifaKwh)}/kWh`, fija: true },
      { nombre: 'Amortización impresora', valor: amortizacion, detalle: `${money.format(cfg.valorImpresora)} ÷ ${cfg.vidaUtilHoras} h de vida útil = ${money.format(cfg.valorImpresora / (cfg.vidaUtilHoras || 1))}/h × ${hs} h`, fija: true },
      { nombre: 'Mantenimiento', valor: mantenimiento, detalle: `${money.format(cfg.mantenimientoHora)}/h × ${hs} h` },
      { nombre: 'Margen por fallas', valor: fallas, detalle: `${cfg.fallasPct}% de material + electricidad + amortización + mantenimiento` },
      { nombre: 'Insumos', valor: otros, detalle: t.porUnidad && cantidad > 1 ? `${money.format(t.otros)} × ${cantidad} u. (argollas, imanes, packaging…)` : 'Argollas, imanes, packaging…' },
      { nombre: 'Diseño (tu tiempo)', valor: diseno, detalle: `${dec(t.horasDiseno)} h × ${money.format(cfg.tarifaDisenoHora)}/h${t.bonificarDiseno ? ' · bonificado: no se cobra' : ''}` },
    ],
    pasos: [
      { nombre: 'Costo de producción', valor: produccion, detalle: 'Material + electricidad + amortización + mantenimiento + fallas + insumos', clase: 'subtotal' },
      { nombre: `+ Ganancia (${gananciaPct}%)`, valor: gananciaPlaneada, detalle: `${money.format(produccion)} × ${gananciaPct}%${t.ganancia == null ? ' (la de Configuración)' : ' (de este pedido)'}` },
      { nombre: '= Precio de producción', valor: precioProduccion, detalle: cantidad === 1 ? 'Para 1 unidad' : `Para las ${cantidad} unidades`, clase: 'subtotal' },
      {
        nombre: 'Precio por unidad',
        valor: listaUnidad,
        detalle: t.precioManual != null
          ? `Tu precio. El mínimo recomendado (costo + ${gananciaPct}%) es ${money.format(sugeridoUnidad)}`
          : `Mínimo recomendado: ${money.format(precioProduccion)} ÷ ${cantidad} u. = ${money.format(precioProduccion / cantidad)}${cfg.redondeo > 0 ? `, redondeado hacia arriba a múltiplos de ${money.format(cfg.redondeo)}` : ''}`,
        clase: t.precioManual != null ? 'manual' : '',
      },
      { nombre: `Piezas (${cantidad} × ${money.format(listaUnidad)})`, valor: subtotalPiezas, detalle: '' },
      ...(diseno > 0 ? [{
        nombre: '+ Diseño',
        valor: disenoCobrado,
        detalle: t.bonificarDiseno ? `Bonificado: vale ${money.format(diseno)} pero no se cobra` : `${dec(t.horasDiseno)} h × ${money.format(cfg.tarifaDisenoHora)}/h`,
      }] : []),
      { nombre: '= Subtotal', valor: subtotal, detalle: '', clase: 'subtotal' },
      ...(descuentoPct > 0 ? [{
        nombre: `− Descuento (${descuentoPct}%)`,
        valor: -descuentoMonto,
        detalle: `${descuentoPct}% sobre el subtotal de ${money.format(subtotal)}${t.descuento == null ? ', según la escala mayorista' : ', ajustado a mano'}${cfg.redondeo > 0 ? ` (total redondeado a múltiplos de ${money.format(cfg.redondeo)})` : ''}`,
      }] : []),
    ],
    costos: { material, electricidad, amortizacion, mantenimiento, fallas, otros },
    produccion,
    diseno,
    disenoCobrado,
    costoTotal,
    gananciaPct,
    gananciaPlaneada,
    precioProduccion,
    sugeridoUnidad,
    descuentoSugerido,
    listaUnidad,
    subtotalPiezas,
    subtotal,
    descuentoPct,
    descuentoMonto,
    senaPct,
    senaMonto,
    total,
    ganancia,
    margenPct: total > 0 ? (ganancia / total) * 100 : 0,
  };
}

// ---------- Formulario de trabajo ----------
const CAMPOS_TRABAJO = ['nombre', 'concepto', 'cantidad', 'gramos', 'horas', 'minutos',
  'horasDiseno', 'bonificarDiseno', 'otros', 'precioManual', 'descuento', 'ganancia', 'senaPct', 'notas'];

function leerTrabajo() {
  return {
    nombre: $('#nombre').value.trim(),
    concepto: $('#concepto').value.trim(),
    filamentoId: $('#filamento').value,
    color: $('#color').value,
    cantidad: num($('#cantidad').value),
    porUnidad: !$('#esTanda').checked,
    gramos: num($('#gramos').value),
    horas: num($('#horas').value),
    minutos: num($('#minutos').value),
    horasDiseno: num($('#horasDiseno').value),
    bonificarDiseno: $('#bonificarDiseno').checked,
    otros: num($('#otros').value),
    // Solo cuentan como manuales si los editaste; si no, muestran el valor automático
    precioManual: $('#precioManual').dataset.manual ? numOrNull($('#precioManual').value) : null,
    descuento: $('#descuento').dataset.manual ? numOrNull($('#descuento').value) : null,
    ganancia: $('#ganancia').dataset.manual ? numOrNull($('#ganancia').value) : null,
    senaPct: $('#senaPct').dataset.manual ? numOrNull($('#senaPct').value) : null,
    notas: $('#notas').value.trim(),
  };
}

function marcarManual(input, manual) {
  if (manual) input.dataset.manual = '1';
  else delete input.dataset.manual;
  input.closest('label').classList.toggle('editado', manual);
}

function cargarTrabajo(t) {
  for (const campo of CAMPOS_TRABAJO) {
    const el = $(`#${campo}`);
    if (el.type === 'checkbox') el.checked = Boolean(t[campo]);
    else el.value = t[campo] ?? '';
  }
  // Las evaluaciones viejas no tienen porUnidad: eran siempre de la tanda completa
  $('#esTanda').checked = !t.porUnidad;
  marcarManual($('#precioManual'), t.precioManual != null);
  marcarManual($('#descuento'), t.descuento != null);
  marcarManual($('#ganancia'), t.ganancia != null);
  marcarManual($('#senaPct'), t.senaPct != null);
  $('#filamento').value = t.filamentoId;
  renderSelectColores();
  $('#color').value = t.color ?? '';
  renderResultado();
}

function filaDl(dl, etiqueta, valor, clase) {
  const div = document.createElement('div');
  if (clase) div.className = clase;
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = etiqueta;
  dd.textContent = valor;
  div.append(dt, dd);
  dl.append(div);
}

function renderResultado() {
  const t = leerTrabajo();
  const r = calcular(config, t);

  $('#desglose').replaceChildren(...r.lineas
    .filter((l) => l.valor > 0 || l.fija)
    .map((l) => {
      const pct = r.costoTotal > 0 ? (l.valor / r.costoTotal) * 100 : 0;
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="linea"><span></span><strong></strong></div>
        <div class="detalle"></div>
        <div class="barra"><span style="width:${pct.toFixed(1)}%"></span></div>`;
      li.querySelector('.linea span').textContent = l.nombre;
      li.querySelector('.linea strong').textContent = money.format(l.valor);
      li.querySelector('.detalle').textContent = l.detalle;
      return li;
    }));

  const costos = $('#costos');
  costos.replaceChildren();
  filaDl(costos, 'Costo de producción', money.format(r.produccion));
  if (r.diseno > 0) filaDl(costos, 'Costo total (con tu hora de diseño)', money.format(r.costoTotal));
  if (r.cantidad > 1) filaDl(costos, 'Costo por unidad (sin diseño)', money.format(r.produccion / r.cantidad));

  const totalHoras = Math.floor(r.horas);
  const totalMin = Math.round((r.horas - totalHoras) * 60);
  $('#tituloPieza').textContent = t.porUnidad ? 'Cada pieza' : 'Toda la tanda';
  $('#ayudaCarga').textContent = t.porUnidad
    ? (r.cantidad > 1 ? `× ${r.cantidad} unidades = ${dec(r.gramos)} g y ${totalHoras} h ${totalMin} min de impresión en total.` : 'Datos de una pieza: se multiplican por la cantidad de abajo.')
    : 'Peso, tiempo e insumos de todas las unidades juntas.';

  // Paso a paso del precio
  $('#pasosPrecio').replaceChildren(...r.pasos.map((p) => {
    const li = document.createElement('li');
    if (p.clase) li.className = p.clase;
    li.innerHTML = '<div class="linea"><span></span><strong></strong></div><div class="detalle"></div>';
    li.querySelector('.linea span').textContent = p.nombre;
    li.querySelector('.linea strong').textContent = p.valor < 0 ? `− ${money.format(-p.valor)}` : money.format(p.valor);
    li.querySelector('.detalle').textContent = p.detalle;
    return li;
  }));

  const dlPrecio = $('#precios');
  dlPrecio.replaceChildren();
  filaDl(dlPrecio, 'Total a cobrar', money.format(r.total), 'destacado');
  if (r.cantidad > 1) filaDl(dlPrecio, 'Equivale por unidad', money.format(r.total / r.cantidad));
  if (r.senaMonto > 0) {
    filaDl(dlPrecio, `Seña para confirmar (${r.senaPct}%)`, money.format(r.senaMonto));
    filaDl(dlPrecio, 'Saldo al entregar', money.format(r.total - r.senaMonto));
  }
  filaDl(dlPrecio, 'Ganancia real (total − costo total)', `${money.format(r.ganancia)} (${r.margenPct.toFixed(0)}%)`, r.ganancia >= 0 ? 'positivo' : 'negativo');

  // Campos de precio y descuento: muestran el valor automático hasta que los edites
  const inputPrecio = $('#precioManual');
  const inputDescuento = $('#descuento');
  if (!inputPrecio.dataset.manual) inputPrecio.value = r.sugeridoUnidad;
  if (!inputDescuento.dataset.manual) inputDescuento.value = r.descuentoSugerido;
  const inputGanancia = $('#ganancia');
  if (!inputGanancia.dataset.manual) inputGanancia.value = config.gananciaPct;
  $('#ayudaGanancia').textContent = inputGanancia.dataset.manual
    ? `De este pedido. En Configuración: ${config.gananciaPct}%.`
    : 'La de Configuración. Subila para piezas chicas.';
  $('#restablecerGanancia').hidden = !inputGanancia.dataset.manual;
  const inputSena = $('#senaPct');
  if (!inputSena.dataset.manual) inputSena.value = config.senaPct ?? 0;
  $('#ayudaSena').textContent = r.senaMonto > 0
    ? `${money.format(r.senaMonto)} al confirmar. ${inputSena.dataset.manual ? `En Ajustes: ${config.senaPct}%.` : 'La de Ajustes.'} 0 = sin seña.`
    : 'Sin seña: no aparece en el presupuesto.';
  $('#restablecerSena').hidden = !inputSena.dataset.manual;
  $('#ayudaPrecio').textContent = inputPrecio.dataset.manual
    ? `Mínimo recomendado: ${money.format(r.sugeridoUnidad)} (costo + ${r.gananciaPct}%).`
    : `Es el mínimo recomendado (costo + ${r.gananciaPct}%). Escribí tu precio de venta si es mayor.`;
  $('#ayudaDescuento').textContent = inputDescuento.dataset.manual
    ? `Editado a mano. Escala: ${r.descuentoSugerido}%.`
    : `Según la escala mayorista (${r.cantidad} u.).`;
  $('#restablecerPrecio').hidden = !inputPrecio.dataset.manual;
  $('#restablecerDescuento').hidden = !inputDescuento.dataset.manual;

  const aviso = $('#aviso');
  const avisos = [];
  if (t.precioManual != null && t.precioManual < r.sugeridoUnidad) {
    avisos.push(`Tu precio por unidad está por debajo del mínimo recomendado (${money.format(r.sugeridoUnidad)}).`);
  }
  if (r.ganancia < 0 && r.total > 0) {
    const sinDiseno = r.total - r.produccion;
    avisos.push(sinDiseno >= 0
      ? `Cubrís los costos de producción, pero no tu hora de diseño (te faltan ${money.format(-r.ganancia)}). Vale la pena si esperás un pedido más grande.`
      : `Estás cobrando por debajo del costo de producción: perdés ${money.format(-sinDiseno)} sin contar el diseño.`);
  }
  aviso.hidden = !avisos.length;
  aviso.textContent = avisos.join(' ');

  renderPresupuesto(t, r);
}

// ---------- Colores ----------
function crearMuestra(hex) {
  const s = document.createElement('span');
  s.className = 'muestra';
  s.style.background = hex;
  return s;
}

function crearChip(color, onBorrar, conMarca = false) {
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.append(crearMuestra(color.hex), conMarca ? claveColor(color) : color.nombre);
  if (onBorrar) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'icon-btn';
    x.title = `Quitar ${color.nombre}`;
    x.textContent = '✕';
    x.addEventListener('click', onBorrar);
    chip.append(x);
  } else {
    chip.style.paddingRight = '0.6rem';
  }
  return chip;
}

/** Agrega el color al filamento, o actualiza el tono si ya existía con ese nombre y marca. */
function guardarColor(fil, color) {
  const existente = fil.colores.find((c) => claveColor(c) === claveColor(color));
  if (existente) existente.hex = color.hex;
  else fil.colores.push(color);
  return existente ? 'actualizado' : 'nuevo';
}

function renderSelectColores() {
  const select = $('#color');
  const actual = select.value;
  const fil = config.filamentos.find((f) => f.id === $('#filamento').value) || config.filamentos[0];
  const opciones = [['', 'A elegir por el cliente'], ...fil.colores.map((c) => [claveColor(c), claveColor(c)])];
  select.replaceChildren(...opciones.map(([valor, texto]) => new Option(texto, valor)));
  if (fil.colores.some((c) => claveColor(c) === actual)) select.value = actual;
}

function renderMarcas() {
  const marcas = new Set(['PrintALot']);
  config.filamentos.forEach((f) => f.colores.forEach((c) => c.marca && marcas.add(c.marca)));
  $('#marcas').replaceChildren(...[...marcas].sort().map((m) => new Option(m)));
}

// Importación desde PrintALot: qué filamento tiene el panel abierto y qué colores trajo
let importando = null;

async function abrirImportacion(fil, boton) {
  boton.disabled = true;
  try {
    const { colores } = await api('GET', `/colores/${fil.printalotId}`);
    importando = { filamentoId: fil.id, colores };
  } catch (e) {
    alert(`No se pudieron traer los colores: ${e.message}`);
  } finally {
    boton.disabled = false;
  }
  renderEditorColores();
}

function panelImportacion(fil) {
  const panel = document.createElement('form');
  panel.className = 'importar';
  const tengo = new Set(fil.colores.filter((c) => c.marca === 'PrintALot').map((c) => c.nombre));
  const lista = document.createElement('div');
  lista.className = 'importar-lista';
  lista.append(...importando.colores.map((c) => {
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.value = c.nombre;
    check.checked = tengo.has(c.nombre);
    label.append(check, crearMuestra(c.hex || hexDeNombre(c.nombre)), c.nombre);
    return label;
  }));
  const ayuda = document.createElement('p');
  ayuda.className = 'nota';
  ayuda.textContent = 'Marcá los colores de PrintALot que tenés. Los que desmarques se quitan de tu catálogo.';
  const acciones = document.createElement('div');
  acciones.className = 'acciones';
  acciones.innerHTML = '<button class="btn small">Guardar selección</button><button type="button" class="btn small secondary">Cancelar</button>';
  acciones.querySelector('[type="button"]').addEventListener('click', () => { importando = null; renderEditorColores(); });
  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    const elegidos = new Set([...lista.querySelectorAll('input:checked')].map((c) => c.value));
    fil.colores = fil.colores.filter((c) => c.marca !== 'PrintALot' || elegidos.has(c.nombre));
    for (const c of importando.colores) {
      if (elegidos.has(c.nombre)) guardarColor(fil, { nombre: c.nombre, hex: c.hex || hexDeNombre(c.nombre), marca: 'PrintALot' });
    }
    importando = null;
    saveConfig();
    renderColores();
  });
  panel.append(ayuda, lista, acciones);
  return panel;
}

function renderEditorColores() {
  renderMarcas();
  $('#editorColores').replaceChildren(...config.filamentos.map((f) => {
    const bloque = document.createElement('div');
    const cabecera = document.createElement('div');
    cabecera.className = 'barra-titulo';
    const titulo = document.createElement('h3');
    titulo.textContent = f.nombre || '(sin nombre)';
    cabecera.append(titulo);
    if (f.printalotId && conectado() && importando?.filamentoId !== f.id) {
      const importar = document.createElement('button');
      importar.type = 'button';
      importar.className = 'btn small secondary';
      importar.textContent = 'Importar de PrintALot';
      importar.addEventListener('click', () => abrirImportacion(f, importar));
      cabecera.append(importar);
    }

    const chips = document.createElement('div');
    chips.className = 'chips';
    if (f.colores.length) {
      chips.append(...f.colores.map((c, i) => crearChip(c, () => {
        f.colores.splice(i, 1);
        saveConfig();
        renderColores();
      }, true)));
    } else {
      chips.innerHTML = '<span class="vacio">Sin colores cargados</span>';
    }

    const form = document.createElement('form');
    form.className = 'nuevo-color';
    const nombre = document.createElement('input');
    nombre.placeholder = 'Nuevo color';
    nombre.setAttribute('aria-label', `Nuevo color de ${f.nombre}`);
    const marca = document.createElement('input');
    marca.placeholder = 'Marca';
    marca.setAttribute('list', 'marcas');
    marca.setAttribute('aria-label', 'Marca');
    const hex = document.createElement('input');
    hex.type = 'color';
    hex.value = '#9e9e9e';
    hex.setAttribute('aria-label', 'Tono');
    const agregar = document.createElement('button');
    agregar.className = 'btn small';
    agregar.textContent = 'Agregar';
    // Sugiere el tono según el nombre hasta que elijas uno a mano
    nombre.addEventListener('input', () => { if (!hex.dataset.elegido) hex.value = hexDeNombre(nombre.value); });
    hex.addEventListener('input', () => { hex.dataset.elegido = '1'; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = nombre.value.trim();
      if (!n) return;
      guardarColor(f, { nombre: n, hex: hex.value, ...(marca.value.trim() ? { marca: marca.value.trim() } : {}) });
      saveConfig();
      renderColores();
    });
    form.append(nombre, marca, hex, agregar);

    bloque.append(cabecera, chips);
    if (importando?.filamentoId === f.id) bloque.append(panelImportacion(f));
    bloque.append(form);
    return bloque;
  }));
}

function renderCatalogo() {
  const conColores = config.filamentos.filter((f) => f.colores.length);
  const cont = $('#catalogoContenido');
  if (!conColores.length) {
    cont.innerHTML = '<p class="catalogo-vacio">Todavía no cargaste colores.</p>';
    return;
  }
  cont.replaceChildren(...conColores.map((f) => {
    const sec = document.createElement('section');
    sec.className = 'catalogo-material';
    const h3 = document.createElement('h3');
    h3.textContent = f.nombre;
    const grilla = document.createElement('div');
    grilla.className = 'catalogo-colores';
    grilla.append(...f.colores.map((c) => {
      const fig = document.createElement('figure');
      fig.append(crearMuestra(c.hex), c.nombre);
      return fig;
    }));
    sec.append(h3, grilla);
    return sec;
  }));
}

function renderColores() {
  renderEditorColores();
  renderCatalogo();
  renderSelectColores();
  renderResultado();
}

// ---------- Escáner de muestras (foto) ----------
const escaner = { imagen: null, blanco: null, marcas: [], pendiente: null, ultimoMaterial: null, ultimaMarca: '' };

function pasoEscaner(texto) { $('#pasoEscaner').textContent = texto; }

function dibujarEscaner() {
  const lienzo = $('#lienzoFoto');
  const ctx = lienzo.getContext('2d');
  ctx.drawImage(escaner.imagen, 0, 0, lienzo.width, lienzo.height);
  const radio = Math.max(10, lienzo.width * 0.018);
  ctx.lineWidth = Math.max(2, lienzo.width / 400);
  ctx.font = `bold ${radio}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const m of escaner.marcas) {
    ctx.beginPath();
    ctx.arc(m.x, m.y, radio, 0, Math.PI * 2);
    ctx.fillStyle = m.hex || 'rgba(255,255,255,0.6)';
    ctx.fill();
    ctx.strokeStyle = '#fa6831';
    ctx.stroke();
    ctx.fillStyle = '#111';
    if (m.etiqueta) ctx.fillText(m.etiqueta, m.x, m.y);
  }
}

/** Mediana de una zona alrededor del toque: ignora el texto grabado, sombras y reflejos. */
function muestrear(x, y) {
  const lienzo = $('#lienzoFoto');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(escaner.imagen, 0, 0, lienzo.width, lienzo.height); // sin marcas encima
  const r = Math.max(4, Math.round(lienzo.width * 0.012));
  const x0 = Math.max(0, Math.round(x - r));
  const y0 = Math.max(0, Math.round(y - r));
  const { data } = ctx.getImageData(x0, y0, Math.min(2 * r, lienzo.width - x0), Math.min(2 * r, lienzo.height - y0));
  const canales = [[], [], []];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) canales[c].push(data[i + c]);
  dibujarEscaner();
  return canales.map((v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);
}

function corregirBlanco(rgb) {
  if (!escaner.blanco) return rgb;
  // La hoja debería verse blanca: se escala cada canal para que lo sea
  return rgb.map((v, i) => (v * 245) / Math.max(1, escaner.blanco[i]));
}

async function cargarFoto(archivo) {
  const url = URL.createObjectURL(archivo);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { alert('No se pudo abrir la imagen.'); return; }
  const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const lienzo = $('#lienzoFoto');
  lienzo.width = Math.round(img.naturalWidth * escala);
  lienzo.height = Math.round(img.naturalHeight * escala);
  Object.assign(escaner, { imagen: img, blanco: null, marcas: [], pendiente: null });
  $('#escaner').hidden = false;
  $('#confirmarColor').hidden = true;
  dibujarEscaner();
  pasoEscaner('Paso 1: tocá una parte de la hoja blanca.');
  lienzo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function tocarFoto(evento) {
  if (!escaner.imagen || escaner.pendiente) return;
  const lienzo = $('#lienzoFoto');
  const rect = lienzo.getBoundingClientRect();
  const x = ((evento.clientX - rect.left) / rect.width) * lienzo.width;
  const y = ((evento.clientY - rect.top) / rect.height) * lienzo.height;
  const rgb = muestrear(x, y);

  if (!escaner.blanco) {
    escaner.blanco = rgb;
    escaner.marcas.push({ x, y, etiqueta: 'B' });
    dibujarEscaner();
    pasoEscaner('Paso 2: tocá el centro de cada muestra (en la parte lisa, sin texto).');
    return;
  }

  const hex = rgbAHex(corregirBlanco(rgb));
  escaner.pendiente = { x, y, hex };
  escaner.marcas.push({ x, y, hex });
  dibujarEscaner();

  const material = $('#cMaterial');
  material.replaceChildren(...config.filamentos.map((f) => new Option(f.nombre, f.id)));
  material.value = escaner.ultimoMaterial || $('#filamento').value;
  $('#cHex').value = hex;
  $('#cNombre').value = nombreDeHex(hex);
  $('#cMarca').value = escaner.ultimaMarca;
  avisarParecido();
  $('#confirmarColor').hidden = false;
  pasoEscaner('Revisá los datos y guardá el color (podés ajustar el tono tocando el cuadrito).');
  $('#confirmarColor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Avisa si ya existe un color muy parecido en ese material, para no cargarlo dos veces. */
function avisarParecido() {
  const fil = config.filamentos.find((f) => f.id === $('#cMaterial').value);
  const hex = $('#cHex').value;
  const parecido = fil?.colores
    .map((c) => ({ c, d: distanciaColor(hex, c.hex) }))
    .sort((a, b) => a.d - b.d)[0];
  $('#cAviso').textContent = parecido && parecido.d < 12
    ? `Se parece a "${claveColor(parecido.c)}", que ya tenés en ${fil.nombre}.`
    : '';
}

function terminarConfirmacion(guardado) {
  if (!guardado) escaner.marcas.pop();
  escaner.pendiente = null;
  $('#confirmarColor').hidden = true;
  dibujarEscaner();
  pasoEscaner('Tocá otra muestra, o "Terminar" cuando estén todas.');
}

$('#fotoMuestras').addEventListener('change', (e) => {
  if (e.target.files[0]) cargarFoto(e.target.files[0]);
  e.target.value = ''; // permite volver a elegir la misma foto
});
$('#lienzoFoto').addEventListener('click', tocarFoto);
$('#cMaterial').addEventListener('change', avisarParecido);
$('#cHex').addEventListener('input', avisarParecido);
$('#confirmarColor').addEventListener('submit', (e) => {
  e.preventDefault();
  const fil = config.filamentos.find((f) => f.id === $('#cMaterial').value);
  const nombre = $('#cNombre').value.trim();
  if (!fil || !nombre) return;
  const marca = $('#cMarca').value.trim();
  const color = { nombre, hex: $('#cHex').value, ...(marca ? { marca } : {}) };
  guardarColor(fil, color);
  saveConfig();
  Object.assign(escaner, { ultimoMaterial: fil.id, ultimaMarca: marca });
  const marcaFoto = escaner.marcas[escaner.marcas.length - 1];
  marcaFoto.hex = color.hex;
  marcaFoto.etiqueta = String(escaner.marcas.filter((m) => m.hex).length);
  renderColores();
  terminarConfirmacion(true);
});
$('#cDescartar').addEventListener('click', () => terminarConfirmacion(false));
$('#recalibrar').addEventListener('click', () => {
  if (escaner.pendiente) terminarConfirmacion(false);
  escaner.blanco = null;
  escaner.marcas = escaner.marcas.filter((m) => m.etiqueta !== 'B');
  dibujarEscaner();
  pasoEscaner('Tocá una parte de la hoja blanca.');
});
$('#cerrarEscaner').addEventListener('click', () => {
  Object.assign(escaner, { imagen: null, blanco: null, marcas: [], pendiente: null });
  $('#escaner').hidden = true;
});

// ---------- Presupuesto ----------
function filaPresupuesto(concepto, cant, unit, subtotal, clase) {
  const tr = document.createElement('tr');
  if (clase) tr.className = clase;
  for (const v of [concepto, cant, unit, subtotal]) {
    const td = document.createElement('td');
    if (v instanceof Node) td.append(v); else td.textContent = v;
    tr.append(td);
  }
  return tr;
}

function renderNegocio() {
  document.querySelectorAll('.pNegocio').forEach((el) => { el.textContent = config.nombreNegocio || 'Impresión 3D'; });
  document.querySelectorAll('.pContacto').forEach((el) => { el.textContent = config.contacto; });
}

function renderPresupuesto(t, r) {
  renderNegocio();
  $('#pFecha').textContent = new Date().toLocaleDateString('es-AR', { dateStyle: 'long' });
  $('#pCliente').textContent = t.nombre ? `Cliente: ${t.nombre}` : '';

  // Al cliente se le muestra el nombre del color, no la marca
  const color = r.filamento.colores.find((c) => claveColor(c) === t.color)?.nombre ?? t.color;
  const material = [r.filamento.nombre, color].filter(Boolean).join(' ');
  const concepto = `${t.concepto || 'Pieza impresa en 3D'} (${material})`;
  const items = [filaPresupuesto(concepto, r.cantidad, money.format(r.listaUnidad), money.format(r.listaUnidad * r.cantidad))];

  if (r.diseno > 0) {
    if (t.bonificarDiseno) {
      const s = document.createElement('s');
      s.textContent = money.format(r.diseno);
      const sub = document.createDocumentFragment();
      sub.append(s, 'Bonificado');
      items.push(filaPresupuesto('Diseño personalizado', 1, money.format(r.diseno), sub, 'bonificado'));
    } else {
      items.push(filaPresupuesto('Diseño personalizado', 1, money.format(r.diseno), money.format(r.diseno)));
    }
  }
  if (r.descuentoMonto > 0) {
    items.push(filaPresupuesto(`Descuento por cantidad (${r.descuentoPct}%)`, '', '', `− ${money.format(r.descuentoMonto)}`, 'descuento'));
  }
  $('#pItems').replaceChildren(...items);
  $('#pTotal').textContent = money.format(r.total);

  const colores = $('#pColores');
  colores.replaceChildren();
  if (!t.color && r.filamento.colores.length) {
    const chips = document.createElement('div');
    chips.className = 'chips';
    chips.append(...r.filamento.colores.map((c) => crearChip(c)));
    colores.append(`Colores disponibles en ${r.filamento.nombre}:`, chips);
  }
  const sena = $('#pSena');
  sena.hidden = !(r.senaMonto > 0 && r.total > 0);
  sena.innerHTML = '<div><span>Seña para confirmar el pedido</span><strong></strong></div><div><span>Saldo al entregar</span><strong></strong></div>';
  sena.querySelector('span').textContent = `Seña para confirmar el pedido (${r.senaPct}%)`;
  const [montoSenaEl, saldoEl] = sena.querySelectorAll('strong');
  montoSenaEl.textContent = money.format(r.senaMonto);
  saldoEl.textContent = money.format(r.total - r.senaMonto);
  $('#pNotas').textContent = t.notas;
  $('#pValidez').textContent = config.validezDias > 0
    ? `Presupuesto válido por ${config.validezDias} días desde la fecha de emisión.`
    : '';
}

// ---------- Exportar ----------
function nombreArchivo(id, ext) {
  const fecha = new Date().toISOString().slice(0, 10);
  if (id === 'catalogoPapel') return `Catálogo de colores ${fecha}.${ext}`;
  const cliente = ($('#nombre').value.trim() || 'presupuesto').replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, '').trim();
  return `Presupuesto ${cliente} ${fecha}.${ext}`;
}

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.append(s);
  });
}

async function exportarJpg(id, boton) {
  boton.disabled = true;
  try {
    if (!window.html2canvas) await cargarScript(HTML2CANVAS_URL);
    // Ancho fijo de documento: en el celular sale igual que en la PC, sin recortes
    const ANCHO_JPG = 680;
    const canvas = await window.html2canvas(document.getElementById(id), {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: 1280,
      onclone: (doc) => {
        const el = doc.getElementById(id);
        Object.assign(el.style, { width: `${ANCHO_JPG}px`, minWidth: `${ANCHO_JPG}px`, maxWidth: 'none', margin: '0' });
      },
    });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.download = nombreArchivo(id, 'jpg');
    a.click();
  } catch (e) {
    alert('No se pudo generar la imagen. ¿Hay conexión a internet?\n' + e.message);
  } finally {
    boton.disabled = false;
  }
}

function exportarPdf(id) {
  const tituloOriginal = document.title;
  document.title = nombreArchivo(id, 'pdf').replace(/\.pdf$/, ''); // nombre sugerido al "Guardar como PDF"
  document.body.dataset.imprimir = id;
  window.print();
  document.title = tituloOriginal;
}
window.addEventListener('afterprint', () => { delete document.body.dataset.imprimir; });

// ---------- Historial (UI) ----------
// Presupuestos guardados; finanzas.js los dibuja junto con el resumen de ganancias.
let evaluaciones = [];

async function renderHistorial() {
  evaluaciones = await historial.listar();
  if (typeof renderFinanzas === 'function') renderFinanzas(); // finanzas.js
}

async function guardarEvaluacion() {
  const t = leerTrabajo();
  const r = calcular(config, t);
  const boton = $('#guardar');
  boton.disabled = true;
  try {
    await historial.guardar({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      fecha: new Date().toISOString(),
      estado: 'presupuestado',
      trabajo: t,
      resumen: {
        filamento: r.filamento.nombre,
        cantidad: r.cantidad,
        costoTotal: Math.round(r.costoTotal),
        total: r.total,
        ganancia: Math.round(r.ganancia),
        margenPct: Math.round(r.margenPct),
      },
    });
    boton.textContent = '✓ Guardado';
  } catch (e) {
    alert(`Se guardó en este dispositivo, pero no en la nube: ${e.message}`);
  } finally {
    boton.disabled = false;
    setTimeout(() => { boton.textContent = 'Guardar en historial'; }, 1500);
    renderHistorial();
  }
}

async function exportarCsv() {
  const lista = await historial.listar();
  const decimal = (n) => String(n).replace('.', ',');
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = [
    ['Fecha', 'Cliente', 'Concepto', 'Filamento', 'Color', 'Cantidad', 'Gramos (total)', 'Horas impresión (total)', 'Horas diseño',
      'Diseño bonificado', 'Costo total', 'Total presupuestado', 'Ganancia', 'Margen %',
      'Estado', 'Entrega', 'Seña', 'Cobrado', 'Fecha de cobro', 'Forma de pago'],
    ...lista.map((e) => [
      new Date(e.fecha).toLocaleDateString('es-AR'),
      e.trabajo.nombre, e.trabajo.concepto, e.resumen.filamento, e.trabajo.color, e.resumen.cantidad,
      // Las evaluaciones cargadas "por unidad" se pasan a totales de la tanda
      decimal(+(e.trabajo.gramos * (e.trabajo.porUnidad ? e.trabajo.cantidad : 1)).toFixed(2)),
      decimal(+((e.trabajo.horas + e.trabajo.minutos / 60) * (e.trabajo.porUnidad ? e.trabajo.cantidad : 1)).toFixed(2)),
      decimal(e.trabajo.horasDiseno), e.trabajo.bonificarDiseno ? 'Sí' : 'No',
      e.resumen.costoTotal, e.resumen.total, e.resumen.ganancia, e.resumen.margenPct,
      e.estado || 'presupuestado', e.entrega || '', e.sena?.monto ?? '', e.cobro?.monto ?? '', e.cobro?.fecha || '', e.cobro?.metodo || '',
    ]),
  ];
  // Punto y coma + BOM para que Excel en español lo abra bien
  const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `presupuestos-3d-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Configuración (UI) ----------
function renderConfigInputs() {
  document.querySelectorAll('[data-config]').forEach((input) => {
    input.value = config[input.dataset.config];
  });
}

function renderSelectFilamentos() {
  const select = $('#filamento');
  const actual = select.value;
  select.replaceChildren(...config.filamentos.map((f) =>
    new Option(`${f.nombre || '(sin nombre)'} – ${money.format(f.precioRollo)} / ${f.pesoRollo} g`, f.id)));
  if (config.filamentos.some((f) => f.id === actual)) select.value = actual;
  renderSelectColores();
}

function opcionesPrintalot(item) {
  const opciones = [['', 'Manual (sin vincular)']];
  for (const p of precios.productos) {
    opciones.push([p.id, `${p.nombre} – ${money.format(p.precio)}${p.enStock ? '' : ' (sin stock)'}`]);
  }
  if (item.printalotId != null && !precios.productos.some((p) => p.id === item.printalotId)) {
    opciones.push([item.printalotId, `Producto PrintALot #${item.printalotId}`]);
  }
  return opciones;
}

// Tabla editable genérica (filamentos y escalas)
function renderTabla(tbody, items, campos, { minimo = 0, onCambio }) {
  tbody.replaceChildren(...items.map((item, i) => {
    const tr = document.createElement('tr');
    for (const { clave, tipo, placeholder, opciones, texto } of campos) {
      const td = document.createElement('td');
      let input;
      if (tipo === 'select') {
        input = document.createElement('select');
        input.append(...opciones(item).map(([v, t]) => new Option(t, v)));
        input.value = item[clave] ?? '';
        input.addEventListener('change', () => {
          item[clave] = texto ? input.value : numOrNull(input.value);
          onCambio(false, clave);
        });
      } else {
        input = document.createElement('input');
        input.type = tipo;
        input.value = item[clave];
        if (placeholder) input.placeholder = placeholder;
        if (tipo === 'number') input.min = '0';
        input.addEventListener('input', () => {
          item[clave] = tipo === 'number' ? num(input.value) : input.value;
          onCambio(false, clave);
        });
      }
      input.setAttribute('aria-label', clave);
      td.append(input);
      tr.append(td);
    }
    const td = document.createElement('td');
    const borrar = document.createElement('button');
    borrar.className = 'icon-btn';
    borrar.title = 'Eliminar';
    borrar.textContent = '✕';
    borrar.disabled = items.length <= minimo;
    borrar.addEventListener('click', () => {
      items.splice(i, 1);
      onCambio(true);
    });
    td.append(borrar);
    tr.append(td);
    return tr;
  }));
}

function renderTablasConfig() {
  const alCambiar = (estructural, clave) => {
    // Vincular un producto aplica su precio al instante
    if (clave === 'printalotId' && aplicarPrecios()) estructural = true;
    saveConfig();
    if (estructural) renderTablasConfig();
    renderSelectFilamentos();
    if (clave === 'nombre' || estructural) { renderEditorColores(); renderCatalogo(); }
    renderResultado();
  };
  renderTabla($('#filamentosBody'), config.filamentos, [
    { clave: 'nombre', tipo: 'text' },
    { clave: 'printalotId', tipo: 'select', opciones: opcionesPrintalot },
    { clave: 'precioRollo', tipo: 'number' },
    { clave: 'pesoRollo', tipo: 'number' },
    { clave: 'consumoW', tipo: 'number' },
  ], { minimo: 1, onCambio: alCambiar });
  renderTabla($('#escalasBody'), config.escalas, [
    { clave: 'desde', tipo: 'number' },
    { clave: 'descuento', tipo: 'number' },
  ], { onCambio: alCambiar });
}

function renderTodo() {
  renderConfigInputs();
  renderTablasConfig();
  renderSelectFilamentos();
  renderEditorColores();
  renderCatalogo();
  renderEstadoPrecios();
  renderResultado();
  if (typeof renderTermica === 'function') renderTermica(true); // termica.js
}

// ---------- Eventos ----------
function activarTab(id) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === id));
  window.scrollTo({ top: 0 });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => activarTab(tab.dataset.tab));
});

$('#trabajo').addEventListener('input', (e) => {
  if (e.target.id === 'filamento') renderSelectColores();
  // Escribir en precio o descuento los deja fijos; borrarlos vuelve al automático
  if (['precioManual', 'descuento', 'ganancia', 'senaPct'].includes(e.target.id)) marcarManual(e.target, e.target.value !== '');
  renderResultado();
});
$('#trabajo').addEventListener('reset', () => setTimeout(() => {
  marcarManual($('#precioManual'), false);
  marcarManual($('#descuento'), false);
  marcarManual($('#ganancia'), false);
  marcarManual($('#senaPct'), false);
  renderSelectColores();
  renderResultado();
}));
for (const [boton, campo] of [['#restablecerPrecio', '#precioManual'], ['#restablecerDescuento', '#descuento'], ['#restablecerGanancia', '#ganancia'], ['#restablecerSena', '#senaPct']]) {
  $(boton).addEventListener('click', () => {
    marcarManual($(campo), false);
    renderResultado();
  });
}

document.querySelectorAll('[data-config]').forEach((input) => {
  input.addEventListener('input', () => {
    config[input.dataset.config] = input.type === 'number' ? num(input.value) : input.value;
    saveConfig();
    renderSelectFilamentos();
    renderResultado();
  });
});

$('#agregarFilamento').addEventListener('click', () => {
  config.filamentos.push({ id: `f${Date.now()}`, nombre: 'Nuevo', printalotId: null, precioRollo: 0, pesoRollo: 1000, consumoW: 80, colores: [] });
  saveConfig();
  renderTodo();
});

$('#agregarEscala').addEventListener('click', () => {
  config.escalas.push({ desde: 0, descuento: 0 });
  saveConfig();
  renderTablasConfig();
});

$('#restaurar').addEventListener('click', () => {
  if (!confirm('¿Restaurar toda la configuración a los valores por defecto? Se pierden los colores cargados.')) return;
  config = structuredClone(DEFAULTS);
  aplicarPrecios();
  saveConfig();
  renderTodo();
});

$('#formIngreso').addEventListener('submit', ingresar);
$('#cerrarSesion').addEventListener('click', () => {
  if (confirm('¿Cerrar sesión en este dispositivo? Vas a tener que volver a ingresar la contraseña.')) cerrarSesion();
});

$('#actualizarPrecios').addEventListener('click', actualizarPreciosAhora);
$('#guardar').addEventListener('click', guardarEvaluacion);
$('#exportarCsv').addEventListener('click', exportarCsv);
document.querySelectorAll('[data-exportar-pdf]').forEach((b) => b.addEventListener('click', () => exportarPdf(b.dataset.exportarPdf)));
document.querySelectorAll('[data-exportar-jpg]').forEach((b) => b.addEventListener('click', () => exportarJpg(b.dataset.exportarJpg, b)));

// ---------- Versión nueva ----------
// GitHub Pages deja que el navegador guarde la página 10 minutos: si hay una versión
// publicada más nueva que la que está corriendo, se recarga sola.
async function buscarVersionNueva() {
  const actual = document.querySelector('script[src^="app.js"]')?.getAttribute('src');
  try {
    const html = await (await fetch(`./?nocache=${Date.now()}`, { cache: 'no-store' })).text();
    const publicada = html.match(/src="(app\.js\?v=[^"]+)"/)?.[1];
    if (actual && publicada && publicada !== actual) location.reload();
  } catch { /* sin conexión: se sigue usando la versión actual */ }
}

// ---------- Inicio ----------
renderTodo();
buscarVersionNueva();
// Con una sesión guardada entra directo (también sin internet, con los datos de este dispositivo)
if (conectado()) {
  desbloquear();
  sincronizarInicio();
} else {
  mostrarBloqueo();
}
