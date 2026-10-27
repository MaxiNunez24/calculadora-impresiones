-- Configuración compartida (una sola fila)
CREATE TABLE IF NOT EXISTS config (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  datos       TEXT NOT NULL,          -- JSON
  actualizado TEXT NOT NULL           -- ISO 8601, gana el más reciente
);

-- Historial de evaluaciones de costo
CREATE TABLE IF NOT EXISTS evaluaciones (
  id    TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  datos TEXT NOT NULL                 -- JSON completo de la evaluación
);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_fecha ON evaluaciones (fecha);

-- Últimos precios leídos de PrintALot
CREATE TABLE IF NOT EXISTS precios (
  producto_id INTEGER PRIMARY KEY,
  nombre      TEXT NOT NULL,
  precio      INTEGER NOT NULL,       -- pesos argentinos
  peso_g      INTEGER NOT NULL,
  en_stock    INTEGER NOT NULL,
  url         TEXT,
  actualizado TEXT NOT NULL
);

-- Colores (nombre y tono) de cada producto de PrintALot, se refrescan cada 7 días
CREATE TABLE IF NOT EXISTS colores_printalot (
  producto_id INTEGER PRIMARY KEY,
  datos       TEXT NOT NULL,          -- JSON: [{ nombre, slug, hex }]
  actualizado TEXT NOT NULL
);

-- Impresora térmica: ventas, pruebas, compras y cambios de rollo (se guardan tal cual ocurrieron)
CREATE TABLE IF NOT EXISTS movimientos (
  id    TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  tipo  TEXT NOT NULL,                -- venta | cambio_rollo | compra_rollos
  datos TEXT NOT NULL                 -- JSON completo del movimiento
);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos (fecha);

-- Links para que un cliente elija colores (id aleatorio; vencen a los 60 días)
CREATE TABLE IF NOT EXISTS compartidos (
  id       TEXT PRIMARY KEY,
  creado   TEXT NOT NULL,
  datos    TEXT NOT NULL,             -- JSON: título, colores ofrecidos y modelo (STL en base64)
  eleccion TEXT                       -- JSON con lo que eligió el cliente
);
