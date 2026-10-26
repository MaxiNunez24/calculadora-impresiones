'use strict';
// Finanzas: estados de los presupuestos 3D, resumen de ganancias por período, recupero de los equipos,
// pendientes (entregas y lo que te deben) y otros gastos.
// Usa lo definido en app.js (config, calcular, historial, evaluaciones, renderHistorial, cargarTrabajo, ...)
// y en termica.js (activos, resumen, gastosDe, registrar, borrarMovimiento, term).

const ESTADOS = {
  presupuestado: '📝 Presupuestado',
  aceptado: '🛠️ Aceptado',
  cobrado: '💰 Cobrado',
  rechazado: '❌ Rechazado',
};
const METODOS = { efectivo: '💵 Efectivo', transferencia: '📲 Transferencia' };
const estadoDe = (e) => e.estado || 'presupuestado'; // los guardados antes de los estados
const diaLocal = (fecha) => fecha.toLocaleDateString('sv-SE'); // AAAA-MM-DD en la hora de Argentina
const hoy = () => diaLocal(new Date());
const diaDe = (iso) => diaLocal(new Date(iso));
const formatoDia = (dia) => new Date(`${dia}T12:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' });

// ---------- Período ----------
let periodo = 'mes';

function rango() {
  const h = new Date();
  if (periodo === 'mes') return [diaLocal(new Date(h.getFullYear(), h.getMonth(), 1)), null];
  if (periodo === 'anterior') return [diaLocal(new Date(h.getFullYear(), h.getMonth() - 1, 1)), diaLocal(new Date(h.getFullYear(), h.getMonth(), 1))];
  return [null, null];
}
function enPeriodo(dia) {
  const [desde, hasta] = rango();
  return (!desde || dia >= desde) && (!hasta || dia < hasta);
}

// ---------- Foto de costos ----------
/** Costos del trabajo en el momento de aceptarlo o cobrarlo: si después sube el filamento, no cambia. */
function fotoCostos(e) {
  const r = calcular(config, e.trabajo);
  const c = Object.fromEntries(Object.entries(r.costos).map(([k, v]) => [k, Math.round(v)]));
  return {
    fecha: hoy(),
    ...c,
    // Insumos que se gastan de verdad (sin la amortización, que es lo que repone la impresora)
    insumos: c.material + c.electricidad + c.mantenimiento + c.fallas + c.otros,
    diseno: Math.round(r.disenoCobrado),
  };
}

// ---------- Números ----------
function numeros3d(filtrar = true) {
  const cobrados = evaluaciones.filter((e) => estadoDe(e) === 'cobrado' && e.cobro && (!filtrar || enPeriodo(e.cobro.fecha)));
  const gastos = activos().filter((m) => m.tipo === 'gasto' && m.area === '3d' && (!filtrar || enPeriodo(diaDe(m.fecha))));
  return {
    cantidad: cobrados.length,
    ingresos: sumar(cobrados, (e) => e.cobro.monto),
    insumos: sumar(cobrados, (e) => e.costos?.insumos || 0),
    amortizacion: sumar(cobrados, (e) => e.costos?.amortizacion || 0),
    diseno: sumar(cobrados, (e) => e.costos?.diseno || 0),
    gastos: sumar(gastos, (m) => m.monto),
  };
}

function numerosTermica(filtrar = true) {
  const movs = activos().filter((m) => !filtrar || enPeriodo(diaDe(m.fecha)));
  const r = resumen(movs);
  const ventas = movs.filter((m) => m.tipo === 'venta');
  return {
    cantidad: r.impresiones,
    ingresos: r.total,
    insumos: r.costoPapel,
    amortizacion: sumar(ventas.filter((m) => !m.esPrueba), (m) => m.amortizacion || 0),
    diseno: 0,
    gastos: sumar(movs.filter((m) => m.tipo === 'gasto' && m.area === 'termica'), (m) => m.monto),
  };
}

function gastosGenerales(filtrar = true) {
  return sumar(activos().filter((m) => m.tipo === 'gasto' && m.area === 'general' && (!filtrar || enPeriodo(diaDe(m.fecha)))), (m) => m.monto);
}

// ---------- Resumen ----------
function renderResumen() {
  const d3 = numeros3d();
  const te = numerosTermica();
  const gen = gastosGenerales();
  const ganancia = (n) => n.ingresos - n.insumos - n.gastos;
  const filas = [
    ['Ingresos cobrados', d3.ingresos, te.ingresos, d3.ingresos + te.ingresos, 'ingresos'],
    ['− Insumos consumidos', -d3.insumos, -te.insumos, -(d3.insumos + te.insumos), ''],
    ['− Otros gastos', -d3.gastos, -te.gastos, -(d3.gastos + te.gastos + gen), ''],
    ['= Ganancia', ganancia(d3), ganancia(te), ganancia(d3) + ganancia(te) - gen, 'total'],
    ['De eso, para reponer equipos', d3.amortizacion, te.amortizacion, d3.amortizacion + te.amortizacion, 'detalle'],
    ['De eso, tu trabajo de diseño', d3.diseno, null, d3.diseno, 'detalle'],
  ];
  const celda = (v) => (v == null ? '—' : v <= -0.5 ? `− ${money.format(-v)}` : money.format(Math.max(0, v) || 0));
  const tabla = $('#tablaFinanzas');
  tabla.innerHTML = `<thead><tr><th></th><th>3D</th><th>Térmica</th><th>Total</th></tr></thead><tbody>${filas.map(([n, a, b, c, clase]) =>
    `<tr class="${clase}"><td>${n}</td>${[a, b, c].map((v) => `<td${v <= -0.5 ? ' class="neg"' : ''}>${celda(v)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  const nombres = { mes: 'este mes', anterior: 'el mes pasado', todo: 'en total' };
  $('#notaFinanzas').textContent =
    `${d3.cantidad} trabajo${d3.cantidad === 1 ? '' : 's'} 3D cobrado${d3.cantidad === 1 ? '' : 's'} y ${te.cantidad} impresiones térmicas vendidas ${nombres[periodo]}` +
    `${gen ? ` · ${money.format(gen)} de gastos generales (solo en el total)` : ''}. ` +
    'Las señas de trabajos en curso cuentan recién cuando el trabajo se cobra.';
}

// ---------- Recupero de los equipos ----------
function barraRecupero(nombre, recuperado, valor, detalle) {
  const pct = valor > 0 ? Math.max(0, Math.min(100, (recuperado / valor) * 100)) : 0;
  const div = document.createElement('div');
  div.className = 'papel-estado';
  div.innerHTML = '<div class="linea"><strong></strong><span></span></div><div class="barra progreso"><span></span></div><small></small>';
  div.querySelector('.linea strong').textContent = nombre;
  div.querySelector('.linea span').textContent = `${dec(+pct.toFixed(pct < 10 ? 1 : 0))}%`;
  div.querySelector('.barra span').style.width = `${pct.toFixed(1)}%`;
  div.querySelector('small').textContent = recuperado >= valor
    ? `🎉 ¡Recuperada! ${money.format(recuperado)} de ${money.format(valor)}.`
    : recuperado < 0
      ? `Vas − ${money.format(-recuperado)}: los gastos todavía superan lo ganado. Faltan ${money.format(valor - recuperado)}.`
      : `${money.format(recuperado)} de ${money.format(valor)} · faltan ${money.format(valor - recuperado)}. ${detalle}`;
  return div;
}

function renderRecuperoEquipos() {
  const d3 = numeros3d(false);
  const te = numerosTermica(false);
  const rec3d = d3.ingresos - d3.insumos - d3.gastos;
  const recTe = te.ingresos - te.insumos - te.gastos;
  const promedio3d = d3.cantidad ? rec3d / d3.cantidad : 0;
  const promedioTe = te.cantidad ? recTe / te.cantidad : 0;
  $('#recuperoEquipos').replaceChildren(
    barraRecupero('🖨️ Prusa MK3S+', rec3d, config.valorImpresora,
      promedio3d > 0 ? `≈ ${Math.ceil((config.valorImpresora - rec3d) / promedio3d)} trabajos más como los que llevás.` : 'Se completa a medida que cobrás trabajos.'),
    barraRecupero('🧾 Térmica Q15', recTe, term().valorImpresora,
      promedioTe > 0 ? `≈ ${Math.ceil((term().valorImpresora - recTe) / promedioTe)} impresiones más.` : 'Se completa con las ventas de la térmica.'),
  );
}

// ---------- Pendientes ----------
function saldo(e) {
  return Math.max(0, (e.resumen?.total || 0) - (e.sena?.monto || 0));
}

function renderPendientes() {
  const aceptados = evaluaciones.filter((e) => estadoDe(e) === 'aceptado')
    .sort((a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999'));
  const esperando = evaluaciones.filter((e) => estadoDe(e) === 'presupuestado');
  const cont = $('#pendientes');
  cont.replaceChildren();

  const teDeben = sumar(aceptados, saldo);
  const senas = sumar(aceptados, (e) => e.sena?.monto || 0);
  cont.append(stat('Te deben', money.format(teDeben), senas ? `ya cobraste ${money.format(senas)} de seña` : ''));

  if (aceptados.length) {
    const ul = document.createElement('ul');
    ul.className = 'historial pendientes-lista';
    ul.append(...aceptados.map((e) => {
      const li = document.createElement('li');
      li.innerHTML = '<div class="info"><strong></strong><small></small></div>';
      li.querySelector('strong').textContent = `🛠️ ${e.trabajo.nombre || 'Sin cliente'} · ${e.resumen.cantidad} u.`;
      let entrega = 'sin fecha de entrega';
      if (e.entrega) {
        const dias = Math.round((new Date(`${e.entrega}T12:00`) - new Date(`${hoy()}T12:00`)) / 86_400_000);
        entrega = `entrega ${formatoDia(e.entrega)} ` + (dias > 1 ? `(en ${dias} días)` : dias === 1 ? '(mañana)' : dias === 0 ? '(¡hoy!)' : `(atrasado ${-dias} días)`);
        if (dias < 0) li.classList.add('atrasado');
      }
      li.querySelector('small').textContent = `${entrega} · seña ${money.format(e.sena?.monto || 0)} · saldo ${money.format(saldo(e))}`;
      return li;
    }));
    cont.append(ul);
  }
  const p = document.createElement('p');
  p.className = 'nota';
  p.textContent = esperando.length
    ? `📝 ${esperando.length} presupuesto${esperando.length === 1 ? '' : 's'} esperando respuesta: ${esperando.slice(0, 4).map((e) => e.trabajo.nombre || 'sin cliente').join(', ')}${esperando.length > 4 ? '…' : ''}.`
    : 'No hay presupuestos esperando respuesta.';
  if (!aceptados.length) p.textContent = `No hay trabajos en curso. ${p.textContent}`;
  cont.append(p);
}

// ---------- Presupuestos ----------
function opciones(select, mapa, valor) {
  select.replaceChildren(...Object.entries(mapa).map(([v, t]) => new Option(t, v)));
  select.value = valor;
}

function formularioGestion(e) {
  const total = e.resumen.total;
  // La seña que figuró en el presupuesto (o la de Ajustes en los guardados antes)
  const senaPctPedido = e.trabajo.senaPct ?? config.senaPct ?? 0;
  const senaSugerida = montoSena(total, senaPctPedido);
  const form = document.createElement('form');
  form.className = 'campos gestion';
  form.innerHTML = `
    <label>Estado <select name="estado"></select></label>
    <label>Fecha de entrega <input name="entrega" type="date"></label>
    <label>Seña ($) <input name="sena" type="number" min="0" step="100" inputmode="decimal">
      <button type="button" class="link" data-accion="sena">Usar ${senaPctPedido}% (${money.format(senaSugerida)})</button></label>
    <label>Seña pagada con <select name="senaMetodo"></select></label>
    <label>Cobrado en total ($) <input name="cobro" type="number" min="0" step="100" inputmode="decimal">
      <small>Incluye la seña. Cambialo si cobraste otro monto.</small></label>
    <label>Fecha de cobro <input name="cobroFecha" type="date"></label>
    <label>Pago final con <select name="cobroMetodo"></select></label>
    <div class="acciones ancho"><button class="btn small">Guardar</button></div>`;
  opciones(form.estado, ESTADOS, estadoDe(e));
  opciones(form.senaMetodo, METODOS, e.sena?.metodo || 'transferencia');
  opciones(form.cobroMetodo, METODOS, e.cobro?.metodo || 'efectivo');
  form.entrega.value = e.entrega || '';
  form.sena.value = e.sena?.monto ?? '';
  form.cobro.value = e.cobro?.monto ?? total;
  form.cobroFecha.value = e.cobro?.fecha || hoy();

  // Solo se muestra lo que tiene sentido para cada estado
  const mostrar = () => {
    const est = form.estado.value;
    const ver = (nombre, si) => { form[nombre].closest('label').hidden = !si; };
    ver('entrega', est === 'aceptado' || est === 'cobrado');
    ver('sena', est === 'aceptado' || est === 'cobrado');
    ver('senaMetodo', (est === 'aceptado' || est === 'cobrado') && form.sena.value > 0);
    ver('cobro', est === 'cobrado');
    ver('cobroFecha', est === 'cobrado');
    ver('cobroMetodo', est === 'cobrado');
  };
  form.estado.addEventListener('change', () => {
    if (form.estado.value === 'aceptado' && form.sena.value === '') form.sena.value = senaSugerida;
    mostrar();
  });
  form.sena.addEventListener('input', mostrar);
  form.querySelector('[data-accion="sena"]').addEventListener('click', () => { form.sena.value = senaSugerida; mostrar(); });
  mostrar();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const est = form.estado.value;
    const actualizado = { ...e, estado: est };
    if (est === 'aceptado' || est === 'cobrado') {
      actualizado.entrega = form.entrega.value || null;
      const sena = Number(form.sena.value);
      actualizado.sena = sena > 0 ? { monto: sena, metodo: form.senaMetodo.value, fecha: e.sena?.fecha || hoy() } : null;
      actualizado.costos = e.costos || fotoCostos(e); // la foto se toma una sola vez
    } else {
      // Volvió a presupuestado o se rechazó: no hay costos ni cobros que contar
      delete actualizado.costos;
    }
    actualizado.cobro = est === 'cobrado'
      ? { monto: Number(form.cobro.value) || total, fecha: form.cobroFecha.value || hoy(), metodo: form.cobroMetodo.value }
      : null;
    const boton = form.querySelector('button.btn');
    boton.disabled = true;
    try {
      await historial.actualizar(actualizado);
    } catch (err) {
      alert(`Se guardó en este dispositivo, pero no en la nube: ${err.message}`);
    }
    renderHistorial();
  });
  return form;
}

function renderListaPresupuestos() {
  const filtro = $('#filtroEstado').value;
  const lista = evaluaciones.filter((e) => !filtro || estadoDe(e) === filtro);
  const ul = $('#listaHistorial');
  if (!lista.length) {
    ul.innerHTML = `<li class="vacio">${evaluaciones.length ? 'No hay presupuestos con ese estado.' : 'Todavía no guardaste ningún presupuesto.'}</li>`;
    return;
  }
  ul.replaceChildren(...lista.map((e) => {
    const est = estadoDe(e);
    const li = document.createElement('li');
    li.className = `estado-${est}`;
    li.innerHTML = `
      <div class="info"><strong></strong><small></small></div>
      <div class="acciones" style="margin:0">
        <span class="badge"></span>
        <button class="btn small secondary" data-accion="cargar">Cargar</button>
        <button class="icon-btn" data-accion="borrar" title="Borrar">✕</button>
      </div>
      <details class="gestionar"><summary>Gestionar</summary></details>`;
    li.querySelector('strong').textContent = `${e.trabajo.nombre || 'Sin cliente'} · ${e.trabajo.concepto || 'Pieza 3D'}`;
    const partes = [
      new Date(e.fecha).toLocaleDateString('es-AR'),
      `${e.resumen.cantidad} u. de ${e.resumen.filamento}`,
      `Total ${money.format(e.resumen.total)}`,
    ];
    if (est === 'aceptado') partes.push(e.entrega ? `entrega ${formatoDia(e.entrega)}` : 'sin fecha de entrega', `seña ${money.format(e.sena?.monto || 0)}`);
    if (est === 'cobrado') partes.push(`cobrado ${money.format(e.cobro.monto)} el ${formatoDia(e.cobro.fecha)}`);
    li.querySelector('small').textContent = partes.join(' · ');
    li.querySelector('.badge').textContent = ESTADOS[est];
    li.querySelector('details').append(formularioGestion(e));
    li.querySelector('[data-accion="cargar"]').addEventListener('click', () => {
      cargarTrabajo(e.trabajo);
      activarTab('calcular');
    });
    li.querySelector('[data-accion="borrar"]').addEventListener('click', async () => {
      if (!confirm('¿Borrar este presupuesto?')) return;
      try { await historial.borrar(e.id); } catch (err) { alert(`Se borró en este dispositivo, pero no en la nube: ${err.message}`); }
      renderHistorial();
    });
    return li;
  }));
}

// ---------- Otros gastos ----------
const AREAS = { '3d': '🖨️ 3D', termica: '🧾 Térmica', general: '📦 General' };

function renderGastos() {
  const lista = activos().filter((m) => m.tipo === 'gasto').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ul = $('#listaGastos');
  if (!lista.length) {
    ul.innerHTML = '<li class="vacio">Todavía no cargaste gastos.</li>';
    return;
  }
  ul.replaceChildren(...lista.map((m) => {
    const li = document.createElement('li');
    li.innerHTML = '<div class="info"><strong></strong><small></small></div><button class="icon-btn" title="Borrar">✕</button>';
    li.querySelector('strong').textContent = `${m.concepto} · ${money.format(m.monto)}`;
    li.querySelector('small').textContent =
      `${new Date(m.fecha).toLocaleDateString('es-AR')} · ${AREAS[m.area] || m.area} · ${m.categoria}${m.pendiente ? ' · ⏳ sin subir' : ''}`;
    li.querySelector('button').addEventListener('click', () => {
      if (confirm(`¿Borrar el gasto "${m.concepto}"?`)) borrarMovimiento(m.id);
    });
    return li;
  }));
}

// ---------- Todo junto ----------
function renderFinanzas() {
  renderResumen();
  renderRecuperoEquipos();
  renderPendientes();
  renderListaPresupuestos();
  renderGastos();
}

document.querySelectorAll('input[name="periodo"]').forEach((r) => r.addEventListener('change', () => {
  periodo = r.value;
  renderFinanzas();
}));
$('#filtroEstado').addEventListener('change', renderListaPresupuestos);
$('#gFecha').value = hoy();
$('#formGasto').addEventListener('submit', (ev) => {
  ev.preventDefault();
  registrar({
    tipo: 'gasto',
    fecha: new Date(`${$('#gFecha').value}T12:00`).toISOString(),
    concepto: $('#gConcepto').value.trim(),
    monto: Number($('#gMonto').value),
    area: $('#gArea').value,
    categoria: $('#gCategoria').value,
  });
  $('#gConcepto').value = '';
  $('#gMonto').value = '';
});

renderFinanzas();
