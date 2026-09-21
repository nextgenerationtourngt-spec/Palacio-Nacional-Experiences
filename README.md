# NGT · Panel APLAN

Panel web responsive para registrar accesos NGT.

## Archivos

- `index.html` — interfaz.
- `styles.css` — diseño responsive.
- `config.js` — URL/key de Supabase y código de experiencia.
- `app.js` — autenticación, carga de tarifas, creación de operaciones y resumen del día.

## Seguridad importante

El navegador **NO debe** calcular ni enviar:

- `ngt_amount`
- totales semanales
- liquidaciones
- snapshots económicos definitivos

El navegador solo envía:

- `experience_id`
- `tariff_type`
- evidencia mínima de residencia si procede
- motivo/nota de cortesía si procede

La función PostgreSQL `aplan_create_operation` debe resolver la tarifa vigente y crear la operación server-side.

## Dependencias de base de datos esperadas

### Tabla `profiles`

Campos usados:

- `id`
- `display_name`
- `role`
- `active`

Roles admitidos por la interfaz:

- `APLAN_OPERATOR`
- `APLAN_ADMIN`

### Tabla `experiences`

Campos usados:

- `id`
- `code`
- `name`
- `timezone`
- `active`

El archivo `config.js` usa por defecto:

`PALACIO_NACIONAL`

### Tabla `tariff_configs`

Campos públicos usados por la interfaz:

- `id`
- `experience_id`
- `tariff_type`
- `public_price`
- `valid_from`
- `valid_until`
- `active`

Tipos esperados:

- `GENERAL`
- `RESIDENT`
- `COURTESY`

## RPC requerida: `aplan_create_operation`

Parámetros esperados:

- `p_experience_id uuid`
- `p_tariff_type text`
- `p_verification_document_type text default null`
- `p_courtesy_reason text default null`
- `p_courtesy_note text default null`

Respuesta esperada:

```json
{
  "operation_id": "uuid",
  "access_code": "NGT-A7K4P2",
  "tariff_type": "GENERAL",
  "public_price": 10,
  "created_at": "2026-09-20T20:30:00Z"
}
```

## RPC requerida: `aplan_today_summary`

Parámetros:

- `p_experience_id uuid`

Respuesta:

```json
{
  "general_count": 68,
  "resident_count": 56,
  "courtesy_count": 3,
  "total_count": 127
}
```

El cálculo del día debe hacerse en PostgreSQL usando `America/El_Salvador`, no con el reloj del navegador.

## Configuración

Abre `config.js` y sustituye:

```js
SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
SUPABASE_ANON_KEY: "TU-PUBLISHABLE-O-ANON-KEY"
```

No uses nunca la `service_role` key en el navegador.

## Estado offline

Esta primera versión detecta pérdida de conexión y bloquea la creación de operaciones.

Esto es intencional: evita comprometer integridad contable antes de implementar correctamente una cola PWA offline con UUID/idempotencia.

## Publicación

Puede alojarse en GitHub Pages, Cloudflare Pages, Netlify o cualquier hosting estático HTTPS.

Para producción, limita el acceso de datos con RLS y permisos de funciones en Supabase.
