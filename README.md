# Cuentas y Ahorro

Aplicación privada para registrar cierres mensuales de cuentas, ahorro e inversiones. Sustituye el libro de Excel por un Worker full-stack de Cloudflare con React, API en Hono y persistencia en D1.

## Funcionalidad incluida

- Resumen actual con cuenta corriente, cuenta de ahorro y PIAS editables.
- Histórico mensual y gráfica de patrimonio total.
- Detalle Liberty por fondo, con unidades, ISIN/ticker, consulta de cotización y conversión a euros.
- Fondo de pensiones HPE con aportación de empresa, aportación personal, valor actual, beneficio y rentabilidad.
- Bolsa por posición, con compras y ventas, origen o destino del dinero, efectivo disponible, cotización y rentabilidad por activo y de la cartera.
- Apertura de un mes copiando instrumentos, identificadores, unidades y costes del cierre anterior.
- Previsualización de precios antes de guardar. Los valores solo pasan a ser históricos al pulsar **Guardar cierre**.
- Acceso protegido por contraseña mediante cookie segura y firmada.

## Arquitectura

- `src/worker.ts`: API del Worker, autenticación, cálculos y proveedores de cotización.
- `src/App.tsx`: interfaz React responsive.
- `migrations/`: esquema versionado de D1.
- `tools/export_excel_to_d1.py`: importador del Excel. El SQL generado se guarda en `.local/` y nunca se sube al repositorio.
- `wrangler.toml`: Worker, assets estáticos, D1 y compilación para despliegue.

Las cotizaciones usan la búsqueda y el gráfico público de Yahoo Finance. La conversión de divisas usa Frankfurter, basado en tipos del BCE. Si un instrumento no se resuelve de forma fiable, la aplicación conserva el último cierre y lo marca para revisión manual.

## Desarrollo local

```powershell
pnpm install
pnpm run db:migrate:local
pnpm run dev
```

Para importar el Excel en la base local:

```powershell
$env:TASK_XLSX='\\Danieta_Nas\home\Drive\Documentos Personales\Cuentas_Ahorro.xlsx'
python .\tools\export_excel_to_d1.py
pnpm exec wrangler d1 execute cuentas-y-ahorro --local --file .local\excel_import.sql
```

## Despliegue

El proyecto usa Cloudflare Workers Builds conectado a la rama `main` de GitHub. `wrangler deploy` ejecuta primero `pnpm run build` mediante la sección `[build]` de `wrangler.toml`. Cada push a `main` crea un nuevo despliegue de producción.

Ruta de producción: `https://danieta.com/cuentasyahorro/`.

Los secretos `APP_PASSWORD` y `AUTH_SECRET` se configuran en Cloudflare y no forman parte del repositorio.
