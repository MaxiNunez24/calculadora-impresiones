# API de la calculadora (Cloudflare Worker + D1)

Guarda la configuración y el historial para compartirlos entre dispositivos, y trae los precios de PrintALot (a pedido, como mucho cada 10 minutos, y automáticamente los lunes).

## Puesta en marcha (una sola vez)

Desde esta carpeta (`worker/`):

```bash
npm install
npx wrangler login
npx wrangler d1 create calculadora-3d
```

Copiá el `database_id` que muestra el último comando en `wrangler.toml` y seguí:

```bash
npx wrangler d1 execute calculadora-3d --remote --file=schema.sql
npx wrangler secret put API_TOKEN
npx wrangler deploy
```

En `secret put` pegá un token largo y aleatorio inventado por vos (no un token de la cuenta de Cloudflare). Para generar uno en PowerShell:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
```

Por último, en la calculadora: **Configuración → Sincronización**, pegá la URL que mostró `wrangler deploy` y el token, y tocá **Conectar**. Hacelo una vez en la PC y otra en el celular.

## STL en la nube (base aparte)

Los STL que subís desde el Catálogo van a otra base, `calculadora-3d-modelos` (binding `MODELOS`), para no llenar la de presupuestos (la capa gratuita da 500 MB por base). Se creó con:

```bash
npx wrangler d1 create calculadora-3d-modelos
npx wrangler d1 execute calculadora-3d-modelos --remote --file=schema_modelos.sql
```

## Desarrollo local

Creá un archivo `.dev.vars` con `API_TOKEN=token-de-prueba` y ejecutá:

```bash
npx wrangler d1 execute calculadora-3d --local --file=schema.sql
npx wrangler d1 execute calculadora-3d-modelos --local --file=schema_modelos.sql
npx wrangler dev --port 8787
```
