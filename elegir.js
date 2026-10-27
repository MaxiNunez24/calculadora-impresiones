'use strict';
// Página pública: el cliente abre elegir.html#<id>, prueba colores y envía su elección.
// No usa la contraseña: el Worker sirve solo este link (id aleatorio, vence a los 60 días).

const API_PUBLICA = (() => {
  const prueba = new URLSearchParams(location.search).get('api'); // solo para probar en la PC
  return prueba && location.hostname === 'localhost' ? prueba : 'https://calculadora-3d-api.maxinunez434.workers.dev';
})();
const $e = (s) => document.querySelector(s);
const idLink = location.hash.slice(1);
const visorCliente = new Visor3D($e('#eLienzo'));
let datosLink = null;
const estado = { numeroIgualLetras: true };

function mensaje(texto, tipo = '') {
  $e('#eEstado').textContent = texto;
  $e('#eEstado').className = `estado ${tipo}`;
}

function nombreColor(hex) {
  return datosLink.colores.find((c) => c.hex.toLowerCase() === (hex || '').toLowerCase())?.nombre || hex;
}

function textoEleccion() {
  const c = coloresElegidos(estado);
  const partes = [`base ${nombreColor(c.base)}`, `letras ${nombreColor(c.letras)}`];
  if (visorCliente.mallas.numero) partes.push(`número ${nombreColor(c.numero)}`);
  return partes.join(', ');
}

function actualizar() {
  visorCliente.pintar(coloresElegidos(estado));
  if (datosLink.whatsapp) {
    const nombre = $e('#eNombre').value.trim();
    const texto = `¡Hola! ${nombre ? `Soy ${nombre}. ` : ''}Para "${datosLink.titulo}" elegí: ${textoEleccion()}.` +
      ($e('#eComentario').value.trim() ? ` ${$e('#eComentario').value.trim()}` : '');
    // Números argentinos: 54 9 + característica + número, sin 0 ni 15
    const numero = datosLink.whatsapp.startsWith('54') ? datosLink.whatsapp : `549${datosLink.whatsapp}`;
    $e('#eWhatsapp').href = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
    $e('#eWhatsapp').hidden = false;
  }
}

async function iniciar() {
  if (!/^[0-9a-f]{32}$/.test(idLink)) {
    $e('#eVacio').textContent = 'Este link no es válido. Pedí uno nuevo a quien te lo mandó.';
    return;
  }
  try {
    const resp = await fetch(`${API_PUBLICA}/publico/${idLink}`);
    const datos = await resp.json();
    if (!resp.ok) throw new Error(datos.error || `Error ${resp.status}`);
    datosLink = datos;
  } catch (e) {
    $e('#eVacio').textContent = e.message;
    return;
  }
  document.title = `${datosLink.titulo} · Elegí los colores`;
  $e('#eTitulo').textContent = datosLink.titulo;
  $e('#eNegocio').textContent = datosLink.negocio;
  // Arranca con lo que ya eligió (si volvió a entrar) o con los dos primeros colores
  datosLink.elecciones ||= [];
  const previa = datosLink.elecciones.at(-1);
  estado.base = previa?.base.hex || datosLink.colores[0].hex;
  estado.letras = previa?.letras.hex || datosLink.colores[1].hex;
  estado.numero = previa?.numero.hex || estado.letras;
  estado.numeroIgualLetras = !previa || previa.numero.hex === previa.letras.hex;
  if (previa?.nombre) $e('#eNombre').value = previa.nombre;
  if (previa?.comentario) $e('#eComentario').value = previa.comentario;

  try {
    await visorCliente.iniciar();
    visorCliente.cargar({
      base: base64ABuffer(datosLink.base),
      numero: datosLink.numero ? base64ABuffer(datosLink.numero) : null,
      altura: datosLink.altura,
    });
  } catch (e) {
    $e('#eVacio').textContent = e.message;
    return;
  }
  $e('#eVacio').hidden = true;
  const partes = PARTES_VISOR.filter(([p]) => p !== 'numero' || visorCliente.mallas.numero);
  renderPaletasVisor($e('#ePaletas'), datosLink.colores, estado, actualizar, partes);
  actualizar();
  $e('#eEnviar').disabled = false;
  $e('#eDescargar').disabled = false;
  if (previa) mensaje(`Ya enviaste ${datosLink.elecciones.length === 1 ? 'una combinación' : `${datosLink.elecciones.length} combinaciones`}. Podés probar otra y enviarla también.`);
  renderEnviadas();
}

/** Guarda la combinación actual en el historial del link. origen: 'web' o 'whatsapp'. */
async function enviarEleccion(origen) {
  const c = coloresElegidos(estado);
  const resp = await fetch(`${API_PUBLICA}/publico/${idLink}/eleccion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...c, nombre: $e('#eNombre').value, comentario: $e('#eComentario').value, origen }),
    keepalive: true, // que llegue aunque se abra WhatsApp
  });
  const datos = await resp.json();
  if (!resp.ok) throw new Error(datos.error || `Error ${resp.status}`);
  datosLink.elecciones = datos.elecciones;
  renderEnviadas();
}

function renderEnviadas() {
  const cont = $e('#eEnviadas');
  const lista = datosLink.elecciones || [];
  if (!lista.length) { cont.replaceChildren(); return; }
  const h3 = document.createElement('h3');
  h3.textContent = 'Tus combinaciones enviadas';
  const ul = document.createElement('ul');
  ul.className = 'historial';
  ul.append(...[...lista].reverse().map((e) => {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'info';
    const muestras = document.createElement('span');
    muestras.className = 'trio';
    muestras.append(...['base', 'letras', 'numero'].map((p) => muestraColor(e[p].hex)));
    const texto = document.createElement('small');
    const partes = [`base ${e.base.nombre}`, `letras ${e.letras.nombre}`];
    if (visorCliente.mallas.numero && e.numero.hex !== e.letras.hex) partes.push(`número ${e.numero.nombre}`);
    texto.textContent = `${partes.join(', ')} · ${new Date(e.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`;
    info.append(muestras, texto);
    const ver = document.createElement('button');
    ver.type = 'button';
    ver.className = 'btn small secondary';
    ver.textContent = 'Ver';
    ver.addEventListener('click', () => {
      Object.assign(estado, { base: e.base.hex, letras: e.letras.hex, numero: e.numero.hex, numeroIgualLetras: e.numero.hex === e.letras.hex });
      const partesVisor = PARTES_VISOR.filter(([p]) => p !== 'numero' || visorCliente.mallas.numero);
      renderPaletasVisor($e('#ePaletas'), datosLink.colores, estado, actualizar, partesVisor);
      actualizar();
      $e('#eLienzo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    li.append(info, ver);
    return li;
  }));
  cont.replaceChildren(h3, ul);
}

$e('#eForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boton = $e('#eEnviar');
  boton.disabled = true;
  try {
    await enviarEleccion('web');
    mensaje(`¡Listo! Recibimos tu elección: ${textoEleccion()}. Si querés, probá otra y enviala también.`, 'ok');
  } catch (e) {
    mensaje(`No se pudo enviar: ${e.message}. Probá con el botón de WhatsApp.`, 'error');
  } finally {
    boton.disabled = false;
  }
});
$e('#eWhatsapp').addEventListener('click', () => {
  enviarEleccion('whatsapp').catch(() => { /* el mensaje de WhatsApp igual sale */ });
});
['#eNombre', '#eComentario'].forEach((s) => $e(s).addEventListener('input', () => datosLink && actualizar()));
document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => visorCliente.vista(b.dataset.vista)));
$e('#eDescargar').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = visorCliente.imagen();
  a.download = `Llavero_${textoEleccion().replace(/[^\wáéíóúñ]+/gi, '-')}.png`;
  a.click();
});

iniciar();
