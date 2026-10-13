# Decisiones aplicadas y dudas pendientes

## Decisiones aplicadas

- PIAS se mantiene como una única cifra mensual, editable y general.
- Cada cierre se identifica por su mes, sin depender del día 14.
- Liberty copia fondos y unidades del mes anterior. Sus aportaciones no intervienen en el cálculo: unidades por cotización determina el valor.
- Bolsa incorpora el libro amarillo del Excel con `A` (compra), `D` (venta total), `R` (reinversión) y `E` (retirada para reinvertir).
- Los cierres anteriores siguen editables, salvo la foto mensual de Bolsa una vez guardada.
- El fondo se llama **Fondo de pensiones empresa** y admite nuevos meses y aportaciones futuras.
- La aplicación sigue siendo personal, con un único PIN.
- Las cotizaciones intentan obtenerse sin API de pago mediante Yahoo Finance, con conversión a euros usando Frankfurter/ECB y entrada manual como respaldo.

## Dudas pendientes

1. **Valores de la imagen que no aparecen como posiciones del Excel.** HCL Tech, Vanguard US 500, Vanguard Global y Acción IBEX 35 aparecen en la captura, pero no como posiciones actuales en las tablas importadas. ¿Son inversiones que hay que añadir o solo valores que vigilabas?
2. **Índices de referencia.** NDX, US500 y ES35 parecen índices para comparar, no posiciones compradas. Por ahora no los he incluido como activos. ¿Quieres que aparezcan en una sección de referencias?
3. **Valores históricos sin símbolo en la imagen.** El Excel sí contiene IAG, Netflix, Telefónica y ROVI; se conservan como históricos y se han asociado a sus símbolos habituales. En Liberty también aparecen fondos antiguos sin identificador en la captura: Fidelity European Growth, Carmignac Patrimoine, C-Quadrat y Liberty European Stock Market. ¿Necesitarás volver a activarlos y consultar su cotización?
4. **Bolsa, siguiente nivel de detalle.** Ya están compras, ventas y reinversiones. Queda decidir más adelante si añadimos operaciones separadas para dividendos, comisiones, retenciones, splits y cambio de divisa.
5. **Proveedor gratuito.** La solución actual no necesita clave, pero la cobertura de fondos por ISIN no está garantizada. La entrada manual evita bloquear el cierre. Si algún fondo falla de forma repetida, habrá que elegir una API especializada o introducir una clave propia.
