# Decisiones aplicadas y dudas pendientes

## Decisiones aplicadas

- PIAS se mantiene como una única cifra mensual, editable y general.
- Cada cierre se identifica por su mes, sin depender del día 14.
- Fondo personal copia fondos y unidades del mes anterior. Sus aportaciones no intervienen en el cálculo: unidades por cotización determina el valor.
- Bolsa incorpora el libro amarillo del Excel como compras y ventas, distinguiendo si el dinero es externo o permanece dentro de la cartera; los códigos históricos `A/D/R/E` se conservan solo por compatibilidad.
- Las unidades de Bolsa se calculan siempre desde el libro de movimientos y no se pueden editar manualmente.
- Los cierres anteriores siguen editables, salvo la foto mensual de Bolsa una vez guardada.
- El fondo se llama **Fondo empresa** y admite nuevos meses y aportaciones futuras.
- La aplicación sigue siendo personal, con un único PIN.
- Las cotizaciones intentan obtenerse sin API de pago mediante Yahoo Finance, con conversión a euros usando Frankfurter/ECB y entrada manual como respaldo.
- Los valores que solo se vigilaban y los índices de referencia viven en **Mercados**, separados de las inversiones.
- Fondo personal y Bolsa permiten editar nombre, ISIN, ticker, símbolo de referencia y divisa desde un popup.
- Bolsa registra dividendos por separado, convierte otras divisas a euros y no contempla comisiones.
- Si no se obtiene una cotización, la aplicación muestra el error y mantiene disponible la entrada manual.
- **Ahorro** replica los cuatro bloques mensuales y los movimientos de fondos de “Detalle Ahorro”.

## Dudas pendientes

1. **Movimientos de Ahorro.** El histórico de fondos ya está importado y visible, pero de momento la edición se centra en los cuatro bloques mensuales. Queda decidir si también quieres altas y correcciones de esos movimientos desde la aplicación.
2. **Histórico de dividendos.** La sección permite registrar, editar y eliminar dividendos. El Excel no ofrece un histórico claramente separado para importarlo; queda confirmar si deseas reconstruir dividendos anteriores manualmente.
3. **Mercados.** La primera versión guarda y muestra la última cotización de cada referencia. Queda decidir si quieres conservar además un histórico propio para comparar índices y valores vigilados mediante gráficas.
4. **Altas de inversiones.** Los activos existentes pueden editarse, y en Mercados se pueden añadir referencias. Queda decidir si Fondo personal y Bolsa también necesitan crear y desactivar inversiones completas desde sus respectivos popups.
