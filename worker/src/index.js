/**
 * API de la calculadora de impresiones.
 *
 *   GET    /config                 configuración compartida entre dispositivos
 *   PUT    /config
 *   GET    /evaluaciones           historial
 *   PUT    /evaluaciones/:id
 *   DELETE /evaluaciones/:id
 *   GET    /movimientos            ventas, pruebas y cambios de rollo de la impresora térmica
 *   PUT    /movimientos/:id
 *   DELETE /movimientos/:id
 *   GET    /precios               últimos precios guardados (no consulta PrintALot)
 *   POST   /precios/actualizar     consulta PrintALot (como mucho cada 10 minutos)
 *   GET    /colores/:productoId    colores (nombre y tono) de un producto de PrintALot, guardados 7 días
 *   POST   /compartidos            crea un link para que un cliente elija colores (devuelve el id)
 *   GET    /compartidos            links creados y lo que eligió cada cliente
 *   DELETE /compartidos/:id
 *
 * Todo requiere "Authorization: Bearer <API_TOKEN>", salvo las rutas públicas de los links
 * (el id es aleatorio de 128 bits, no se puede adivinar; vencen a los 60 días):
 *   GET    /publico/:id            modelo y colores ofrecidos
 *   POST   /publico/:id/eleccion   el cliente guarda los colores que eligió
 *
 * Un cron semanal también actualiza los precios.
 */

const PRINTALOT_API = 'https://printalot.com.ar/wp-json/wc/store/v1/products?category=338&per_page=100';
const PRINTALOT_PRODUCTO = 'https://printalot.com.ar/wp-json/wc/store/v1/products/';
const MINUTOS_ENTRE_ACTUALIZACIONES = 10;
const DIAS_CACHE_COLORES = 7;
const USER_AGENT = 'calculadora-3d-personal (consulta semanal de precios)';
const DIAS_LINK = 60;
const MAX_LINK_BYTES = 1_800_000; // D1 admite filas de hasta 2 MB

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin'), env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (new URL(request.url).pathname.startsWith('/publico/')) return json(await rutearPublico(request, env), 200, cors);
      if (!(await autorizado(request, env))) throw new HttpError(401, 'Token inválido');
      return json(await rutear(request, env), 200, cors);
    } catch (e) {
      return json({ error: e.message }, e.status || 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(actualizarPrecios(env, { forzar: true }));
  },
};

// ---------- HTTP ----------
function corsHeaders(origin, env) {
  const permitidos = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const headers = {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && permitidos.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function autorizado(request, env) {
  if (!env.API_TOKEN) throw new HttpError(500, 'Falta configurar el secreto API_TOKEN');
  const recibido = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  // Comparación en tiempo constante sobre los hashes, para no filtrar el token por timing
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(recibido)),
    crypto.subtle.digest('SHA-256', enc.encode(env.API_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function leerJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'El cuerpo no es JSON válido');
  }
}

async function rutear(request, env) {
  const [recurso, id] = new URL(request.url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const metodo = request.method;

  if (recurso === 'config' && !id) {
    if (metodo === 'GET') {
      const fila = await env.DB.prepare('SELECT datos, actualizado FROM config WHERE id = 1').first();
      return fila ? { datos: JSON.parse(fila.datos), actualizado: fila.actualizado } : { datos: null, actualizado: null };
    }
    if (metodo === 'PUT') {
      const { datos, actualizado } = await leerJson(request);
      if (!datos || !actualizado) throw new HttpError(400, 'Faltan "datos" o "actualizado"');
      await env.DB.prepare(
        `INSERT INTO config (id, datos, actualizado) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado`,
      ).bind(JSON.stringify(datos), actualizado).run();
      return { ok: true };
    }
  }

  if (recurso === 'evaluaciones') {
    if (metodo === 'GET' && !id) {
      const { results } = await env.DB.prepare('SELECT datos FROM evaluaciones ORDER BY fecha DESC').all();
      return results.map((r) => JSON.parse(r.datos));
    }
    if (metodo === 'PUT' && id) {
      const evaluacion = await leerJson(request);
      if (evaluacion.id !== id || !evaluacion.fecha) throw new HttpError(400, 'Evaluación inválida');
      await env.DB.prepare('INSERT OR REPLACE INTO evaluaciones (id, fecha, datos) VALUES (?1, ?2, ?3)')
        .bind(id, evaluacion.fecha, JSON.stringify(evaluacion)).run();
      return { ok: true };
    }
    if (metodo === 'DELETE' && id) {
      await env.DB.prepare('DELETE FROM evaluaciones WHERE id = ?1').bind(id).run();
      return { ok: true };
    }
  }

  if (recurso === 'movimientos') {
    if (metodo === 'GET' && !id) {
      const { results } = await env.DB.prepare('SELECT datos FROM movimientos ORDER BY fecha DESC').all();
      return results.map((r) => JSON.parse(r.datos));
    }
    if (metodo === 'PUT' && id) {
      const movimiento = await leerJson(request);
      if (movimiento.id !== id || !movimiento.fecha || !movimiento.tipo) throw new HttpError(400, 'Movimiento inválido');
      await env.DB.prepare('INSERT OR REPLACE INTO movimientos (id, fecha, tipo, datos) VALUES (?1, ?2, ?3, ?4)')
        .bind(id, movimiento.fecha, movimiento.tipo, JSON.stringify(movimiento)).run();
      return { ok: true };
    }
    if (metodo === 'DELETE' && id) {
      await env.DB.prepare('DELETE FROM movimientos WHERE id = ?1').bind(id).run();
      return { ok: true };
    }
  }

  if (recurso === 'precios') {
    if (metodo === 'GET' && !id) return listarPrecios(env);
    if (metodo === 'POST' && id === 'actualizar') return actualizarPrecios(env);
  }

  if (recurso === 'compartidos') {
    if (metodo === 'POST' && !id) return crearCompartido(request, env);
    if (metodo === 'GET' && !id) {
      const { results } = await env.DB.prepare(
        "SELECT id, creado, json_extract(datos, '$.titulo') AS titulo, eleccion FROM compartidos ORDER BY creado DESC",
      ).all();
      return results.map((r) => ({ id: r.id, creado: r.creado, titulo: r.titulo, eleccion: r.eleccion ? JSON.parse(r.eleccion) : null }));
    }
    if (metodo === 'DELETE' && id) {
      await env.DB.prepare('DELETE FROM compartidos WHERE id = ?1').bind(id).run();
      return { ok: true };
    }
  }

  if (recurso === 'colores' && metodo === 'GET' && /^\d+$/.test(id || '')) {
    return coloresPrintalot(env, Number(id));
  }

  throw new HttpError(404, 'Ruta no encontrada');
}

// ---------- Precios de PrintALot ----------
async function listarPrecios(env) {
  const { results } = await env.DB.prepare(
    'SELECT producto_id, nombre, precio, peso_g, en_stock, url, actualizado FROM precios ORDER BY nombre',
  ).all();
  return {
    actualizado: results[0]?.actualizado ?? null,
    productos: results.map((r) => ({
      id: r.producto_id, nombre: r.nombre, precio: r.precio, pesoG: r.peso_g, enStock: Boolean(r.en_stock), url: r.url,
    })),
  };
}

function decodificarHtml(texto) {
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Peso del rollo a partir del nombre: "1 kg", "0,25 kg", "500 g". */
function pesoEnGramos(nombre) {
  const m = nombre.match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if (!m) return null;
  const valor = Number(m[1].replace(',', '.'));
  return Math.round(m[2].toLowerCase() === 'kg' ? valor * 1000 : valor);
}

function normalizar(producto) {
  const nombre = decodificarHtml(producto.name).replace(/\s+/g, ' ').trim();
  if (/^combo/i.test(nombre) || /2[.,]85/.test(nombre)) return null; // solo rollos sueltos de 1.75 mm
  const pesoG = pesoEnGramos(nombre);
  const precio = Number(producto.prices?.price) / 10 ** (producto.prices?.currency_minor_unit ?? 2);
  if (!pesoG || !precio) return null;
  return { id: producto.id, nombre, precio: Math.round(precio), pesoG, enStock: producto.is_in_stock, url: producto.permalink };
}

async function actualizarPrecios(env, { forzar = false } = {}) {
  if (!forzar) {
    const ultima = await env.DB.prepare('SELECT MAX(actualizado) AS a FROM precios').first();
    if (ultima?.a && Date.now() - Date.parse(ultima.a) < MINUTOS_ENTRE_ACTUALIZACIONES * 60_000) {
      return { ...(await listarPrecios(env)), cacheado: true };
    }
  }

  const resp = await fetch(PRINTALOT_API, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new HttpError(502, `PrintALot respondió ${resp.status}`);
  const productos = (await resp.json()).map(normalizar).filter(Boolean);
  if (!productos.length) throw new HttpError(502, 'PrintALot no devolvió filamentos');

  const ahora = new Date().toISOString();
  const insertar = env.DB.prepare(
    'INSERT INTO precios (producto_id, nombre, precio, peso_g, en_stock, url, actualizado) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
  );
  await env.DB.batch([
    env.DB.prepare('DELETE FROM precios'),
    ...productos.map((p) => insertar.bind(p.id, p.nombre, p.precio, p.pesoG, p.enStock ? 1 : 0, p.url, ahora)),
  ]);
  return listarPrecios(env);
}

// ---------- Colores de PrintALot ----------
function normalizarHex(hex) {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

/** Lee las muestras de color (nombre y tono) de la página del producto. La API no trae el tono. */
async function coloresPrintalot(env, productoId) {
  const cache = await env.DB.prepare('SELECT datos, actualizado FROM colores_printalot WHERE producto_id = ?1')
    .bind(productoId).first();
  if (cache && Date.now() - Date.parse(cache.actualizado) < DIAS_CACHE_COLORES * 86_400_000) {
    return { actualizado: cache.actualizado, colores: JSON.parse(cache.datos) };
  }

  // 1) La API dice qué colores tiene este producto y cómo se llaman
  const respApi = await fetch(`${PRINTALOT_PRODUCTO}${productoId}`, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (respApi.status === 404) throw new HttpError(404, 'Producto no encontrado en PrintALot');
  if (!respApi.ok) throw new HttpError(502, `PrintALot respondió ${respApi.status}`);
  const producto = await respApi.json();
  const atributo = producto.attributes?.find((a) => a.taxonomy === 'pa_color');
  const nombres = new Map((atributo?.terms || []).map((t) => [t.slug, decodificarHtml(t.name)]));
  const slugs = [...new Set((producto.variations || [])
    .flatMap((v) => v.attributes.filter((a) => a.name === atributo?.name).map((a) => a.value)))];
  if (!slugs.length) throw new HttpError(404, 'Este producto no tiene colores para elegir');

  // 2) La página del producto tiene el tono de cada muestra (la página también
  //    muestra productos relacionados, por eso solo se usan los slugs de arriba)
  const resp = await fetch(producto.permalink, { headers: { Accept: 'text/html', 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new HttpError(502, `PrintALot respondió ${resp.status}`);
  const tonos = new Map();
  let slugActual = null;
  await new HTMLRewriter()
    .on('li.variable-item[data-attribute_name="attribute_pa_color"]', {
      element(el) { slugActual = el.getAttribute('data-value'); },
    })
    .on('li.variable-item span.variable-item-span-color', {
      element(el) {
        const hex = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.exec(el.getAttribute('style') || '');
        if (slugActual && hex && !tonos.has(slugActual)) tonos.set(slugActual, normalizarHex(hex[0]));
        slugActual = null;
      },
    })
    .transform(resp)
    .arrayBuffer();

  const colores = slugs.map((slug) => ({ slug, nombre: nombres.get(slug) || slug, hex: tonos.get(slug) || null }));
  const ahora = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO colores_printalot (producto_id, datos, actualizado) VALUES (?1, ?2, ?3)
     ON CONFLICT(producto_id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado`,
  ).bind(productoId, JSON.stringify(colores), ahora).run();
  return { actualizado: ahora, colores };
}

// ---------- Links para que el cliente elija colores ----------
const esHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const texto = (v, max) => String(v ?? '').trim().slice(0, max);

async function crearCompartido(request, env) {
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_LINK_BYTES) throw new HttpError(413, 'El modelo es demasiado grande para compartir');
  let d;
  try { d = JSON.parse(cuerpo); } catch { throw new HttpError(400, 'El cuerpo no es JSON válido'); }
  const colores = (Array.isArray(d.colores) ? d.colores : []).filter((c) => esHex(c?.hex)).slice(0, 40)
    .map((c) => ({ nombre: texto(c.nombre, 40), hex: c.hex }));
  if (colores.length < 2) throw new HttpError(400, 'Ofrecé al menos dos colores');
  if (typeof d.base !== 'string' || !d.base) throw new HttpError(400, 'Falta el modelo de la base');
  const datos = {
    titulo: texto(d.titulo, 80) || 'Tu llavero',
    negocio: texto(d.negocio, 80),
    whatsapp: texto(d.whatsapp, 20).replace(/\D/g, ''),
    altura: Number(d.altura) || 2,
    colores,
    base: d.base,
    numero: typeof d.numero === 'string' ? d.numero : null,
  };
  const id = crypto.randomUUID().replace(/-/g, '');
  await env.DB.prepare('INSERT INTO compartidos (id, creado, datos) VALUES (?1, ?2, ?3)')
    .bind(id, new Date().toISOString(), JSON.stringify(datos)).run();
  return { id };
}

async function rutearPublico(request, env) {
  const [, id, accion] = new URL(request.url).pathname.split('/').filter(Boolean);
  if (!/^[0-9a-f]{32}$/.test(id || '')) throw new HttpError(404, 'Link inválido');
  const fila = await env.DB.prepare('SELECT datos, creado, eleccion FROM compartidos WHERE id = ?1').bind(id).first();
  if (!fila || Date.now() - Date.parse(fila.creado) > DIAS_LINK * 86_400_000) {
    throw new HttpError(404, 'Este link no existe o ya venció');
  }
  const datos = JSON.parse(fila.datos);
  if (request.method === 'GET' && !accion) {
    return { ...datos, eleccion: fila.eleccion ? JSON.parse(fila.eleccion) : null };
  }
  if (request.method === 'POST' && accion === 'eleccion') {
    const e = await leerJson(request);
    const permitidos = new Set(datos.colores.map((c) => c.hex.toLowerCase()));
    for (const parte of ['base', 'letras', 'numero']) {
      if (!esHex(e[parte]) || !permitidos.has(e[parte].toLowerCase())) throw new HttpError(400, 'Color no disponible');
    }
    const nombreDe = (hex) => datos.colores.find((c) => c.hex.toLowerCase() === hex.toLowerCase()).nombre;
    const eleccion = {
      fecha: new Date().toISOString(),
      base: { hex: e.base, nombre: nombreDe(e.base) },
      letras: { hex: e.letras, nombre: nombreDe(e.letras) },
      numero: { hex: e.numero, nombre: nombreDe(e.numero) },
      nombre: texto(e.nombre, 60),
      comentario: texto(e.comentario, 300),
    };
    await env.DB.prepare('UPDATE compartidos SET eleccion = ?1 WHERE id = ?2').bind(JSON.stringify(eleccion), id).run();
    return { ok: true, eleccion };
  }
  throw new HttpError(404, 'Ruta no encontrada');
}
