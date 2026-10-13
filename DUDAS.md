# Decisiones provisionales y dudas

1. **PIAS / Aportaciones.** En esta primera versión se guarda un total mensual editable. Falta decidir si el modelo definitivo separa Finletic y MyInvestor, y qué aportaciones o retiradas deben alimentar cada uno.
2. **ISIN de Liberty.** El Excel no contiene los ISIN como texto. Hay que completar el identificador de cada fondo en la aplicación para evitar coincidencias ambiguas por nombre.
3. **Proveedor de fondos.** Yahoo Finance funciona bien cuando el ISIN o ticker resuelve una clase concreta, pero no garantiza cobertura de todos los fondos. Conviene confirmar si se acepta este proveedor o si se añadirá uno con API key.
4. **Día de cierre.** El histórico usa el día 14 de cada mes. Hay que confirmar si debe mantenerse fijo o si el cierre puede guardarse con cualquier fecha.
5. **Liberty: unidades y aportaciones.** La app copia las unidades del mes anterior y permite editarlas. Falta definir si una aportación debe introducirse como importe y derivar automáticamente unidades nuevas, y cómo tratar comisiones.
6. **Bolsa: operaciones.** Se ha importado el histórico agregado y las posiciones actuales. Falta perfilar el libro de operaciones: compras, ventas, dividendos, comisiones, retenciones, splits y cambio de divisa de cada operación.
7. **Bolsa: nombres y símbolos.** Algunos rótulos del Excel, como `SP500`, `Rare Earth` o `Defense`, pueden representar ETF concretos. Se necesitan sus ISIN o tickers exactos.
8. **Fonditel / HPE.** El Excel deja de registrar aportaciones en septiembre de 2026 aunque mantiene valor actual. Hay que confirmar si el plan terminó, se traspasó o solo dejó de recibir aportaciones.
9. **Histórico de notas.** Se importaron las notas de la hoja `Valor`. Falta decidir si deben poder editarse en cierres ya cerrados o si esos cierres deben bloquearse.
10. **Acceso.** La versión inicial usa una contraseña única. Si habrá más usuarios, conviene sustituirla por Cloudflare Access o cuentas separadas.
