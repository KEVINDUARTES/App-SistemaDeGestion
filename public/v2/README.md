# v2: app completa con la planilla única

Copia de la app actual (commit d92282b) para refactorizar el paso 1 sin tocar la versión en uso.
Si la planilla única no sirve, se borra `public/v2/` y no se pierde nada.

## Qué hay acá
- `index.html`, `app.js`, `auth.js`, `styles.css`, `login.html`, `login.css`, `services/`: la app completa, copiada de `public/`.
  Es lo que se va a modificar. Las rutas son relativas, así que funciona dentro de `/v2/`.
- `planilla-demo/`: la grilla sola con datos inventados (prototipo). Sirve de referencia para integrarla a la app.

## Reglas
- No se toca nada fuera de `public/v2/` (ni `public/app.js`, ni `google-apps-script/Code.gs`).
- Se usan solo las funciones del servidor que ya usa la versión actual.
- Se prueba con una cuenta propia con hoja de datos de prueba, aparte de la de la clienta.

## Qué cambia respecto de la v1
Pasos 1 al 3 de hoy (Pedidos del día, Armar camiones, Confirmar recepción) pasan a ser una sola planilla del día.
Precios al cliente, Cobranza al cliente, Pagar al proveedor, las pantallas de pendientes y Cerrar el día no cambian.

## Cuidado: mismo sitio que la v1
La v1 y la v2 comparten el almacenamiento del navegador (sesión, cachés, preferencias) cuando se abren desde el mismo sitio.
Si la v2 cambia el formato de algún dato guardado, hay que ponerle otro nombre para no pisar el de la v1.

## Reglas de negocio que tienen que sobrevivir
Reparto proporcional de lo recibido, repartos manuales, productos con varios proveedores, comisiones por producto,
varias personas a la vez, días cerrados que no se tocan, y que cada pedido tenga su línea de precio.
