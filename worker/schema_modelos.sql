-- Base "calculadora-3d-modelos": STL que el usuario elige subir para verlos desde cualquier dispositivo.
-- Cada STL se guarda comprimido (gzip) y partido en pedazos, porque D1 admite filas de hasta 2 MB.
CREATE TABLE IF NOT EXISTS modelos (
  id       TEXT PRIMARY KEY,
  nombre   TEXT NOT NULL,
  creado   TEXT NOT NULL,
  bytes    INTEGER NOT NULL,          -- tamaño del STL original
  bytes_gz INTEGER NOT NULL,          -- tamaño comprimido (lo que ocupa en la nube)
  partes   INTEGER NOT NULL           -- cantidad de pedazos
);

CREATE TABLE IF NOT EXISTS modelo_partes (
  modelo TEXT NOT NULL,
  n      INTEGER NOT NULL,
  datos  BLOB NOT NULL,
  PRIMARY KEY (modelo, n)
);
