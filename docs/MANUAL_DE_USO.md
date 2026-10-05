# Manual de uso — Luciano Cargas

Guía para usar la app todos los días. En la computadora el menú está a la izquierda. En el celular y en la tablet, el menú se abre con el botón de las tres rayas, y la barra de abajo recorre el camino principal: Pedidos, Camiones, Recepción, Precios, Cobro, Pago y Cierre.

En el celular las tablas se ven como fichas: el nombre del dato a la izquierda y el valor a la derecha.

## Para qué sirve

La app organiza un día de reparto:

1. Anotás qué pidió cada cliente y a qué proveedor va.
2. Se lo mandás al proveedor por WhatsApp.
3. Armás los camiones y le mandás la hoja a quien carga.
4. Cuando llega, confirmás cuánto vino y a qué costo.
5. Armás el precio para el cliente. La ganancia y el total se calculan solos, y se lo enviás en PDF por WhatsApp.
6. Cobrás al cliente. Si paga por transferencia, anotás de qué cuenta vino y a qué proveedor va ese dinero.
7. Le pagás al proveedor. Ahí ves de qué cliente vino cada depósito.
8. Si hace falta, repartís el efectivo del día entre los proveedores.
9. Cerrás el día. El stock de todos los productos se actualiza en ese momento.

El pago al proveedor no se carga en Pedidos. Se carga en **Pagar al proveedor** o en **Repartir efectivo**.

## Cómo entrar

1. Abrí la app.
2. Poné tu correo y tu contraseña.
3. Si la primera vez tarda unos segundos, esperá. En ese mismo celular, la próxima entrada es más rápida.
4. Para salir, usá **Salir**, arriba a la derecha.

Arriba de cada pantalla del día aparece **Pedido del día**. Si la mercadería de ayer llega hoy, elegí la fecha de ayer y seguí con esa misma fecha en camiones, recepción, precios, cobro, pago y cierre.

## Antes del primer día

Cargá esto una sola vez, en **Configuración**. Después solo lo tocás cuando hay alguien nuevo o un producto nuevo.

### Clientes

**Configuración → Clientes → Agregar cliente.**

- Nombre.
- Teléfono de WhatsApp. Sin teléfono no se le puede mandar la lista de precios ni el saldo.

### Proveedores

**Configuración → Proveedores → Agregar proveedor.**

- Nombre.
- Rubro: Verdura, Bebida, Mixto u Otro.
- Teléfono de WhatsApp. Sin teléfono no se le puede mandar el pedido.

### Productos

**Configuración → Productos → Agregar producto.**

- Nombre.
- Tipo: Verdura o Bebida.
- Unidad: kg, unidad, caja, docena o litro.
- Proveedor predeterminado. Es el que se propone al armar el pedido. En cada pedido se puede elegir otro proveedor. Si queda vacío, el pedido aparece como **Sin proveedor** y no se puede enviar.

El mismo producto puede pedirse a distintos proveedores. El proveedor queda guardado en el pedido, no cambia el predeterminado del producto.

Verduras y bebidas llevan stock. Se ve en **Configuración → Stock** y se mueve al cerrar el día.

## El día, paso a paso

### 1. Pedidos del día

Anotá cada pedido: cliente, producto, cantidad y proveedor.

- **Agregar pedido** carga uno nuevo.
- En **Acciones** podés editarlo, eliminarlo, elegir el proveedor o reenviar el WhatsApp. Al editar también se puede cambiar el proveedor.
- **Enviar pendientes a proveedores** abre un mensaje de WhatsApp por cada proveedor, con todo lo que le corresponde.
- Cuando un pedido ya se envió, figura **Enviado**. Podés reenviarlo desde Acciones.
- **Seguir a camiones** pasa al paso 2.

### 2. Armar camiones

Repartí los clientes del día en camiones, para quien carga la mercadería.

- **Agregar camión** suma un camión. Le podés cambiar el nombre.
- En cada camión elegís los clientes que van juntos. Un cliente va en un solo camión ese día. Si ya está en otro, al sumarlo dice que sale de ese camión y se mueve.
- **Quitar camión** lo saca. Los clientes quedan sin camión.
- **Imprimir** saca la hoja de un camión. **Imprimir todos** saca todas.
- **WhatsApp** o **Enviar todos** arma el PDF y abre el chat. Pedile el teléfono a quien carga. En el celular podés compartir el PDF directo. En la computadora se descarga el archivo para adjuntarlo en el chat.
- **Enviar todos** junta todos los camiones en el mismo archivo, un camión por hoja.
- **Seguir a recepción** pasa al paso 3.

La hoja entra en una página por camión:

- Cada producto es una fila.
- Cada cliente es una columna, con su nombre arriba y la cantidad abajo.
- La columna azul es el total de ese producto.
- Al lado va el proveedor (el puesto).
- Al final está el total a cargar del camión.

Si el mismo producto sale de dos proveedores, son dos filas.

### 3. Confirmar recepción

Cuando llega la mercadería, confirmá **cada producto**.

- **Pedido** es lo que se pidió, sumando a todos los clientes.
- **Llegó** es lo que vino de verdad. Si pediste 10 y vinieron 8, poné 8.
- Si no vino nada, poné **0** y confirmá igual. Si no lo confirmás, el día no se puede cerrar.
- **Precio real** es lo que te cobró el proveedor **por una unidad** (un kg, una caja, una unidad). No es el total del pedido y no es el precio al cliente. Si llegaron 9 cajas, cargá el costo de una caja.
- Lo que escribís en **Llegó** y en **Precio real** se guarda solo. No hace falta un botón de borrador.
- Si llegó algo y no cargaste el precio real, no te deja confirmar.
- **Confirmar** cierra ese producto. **Confirmar todos los completos** confirma de una vez los que ya tienen cantidad y, si llegó mercadería, precio real.
- Al confirmar, la app arma sola la lista de precios al cliente, con la cantidad que llegó. Si faltó mercadería, esa cantidad se reparte entre los clientes que la pidieron.
- **Seguir a precios** pasa al paso 4.

Si un día no se confirmó y hay que recibirlo después, usá el paso 9, **Confirmar recepción (pendientes)**.

### 4. Precios al cliente

Acá definís cuánto le cobrás a cada cliente por cada unidad.

- **Precio real** ya viene de la recepción. No se cambia acá.
- **Precio cliente** es lo que le cobrás vos por cada unidad.
- Mientras lo escribís, se actualizan la **ganancia**, el **total** de esa fila, el **total de productos** y el **saldo total**. En el celular también, sin salir del campo.
- **Ganancia** es la diferencia entre el precio al cliente y el costo del proveedor, por la cantidad. La comisión no entra en la ganancia.
- **Comisión de reparto por unidad** se suma aparte. El saldo del cliente es el total de productos más la comisión.
- **Armar lista** vuelve a armar la lista con lo confirmado en recepción. Usalo si cambiaste una recepción.
- **Guardar precios** deja los precios guardados para la cobranza.
- Para mandar la lista, primero elegí **un cliente** en el filtro y después **WhatsApp PDF**. Arma el PDF de esa lista (productos, precio con la comisión incluida y total a pagar) y lo manda al WhatsApp de ese cliente. En el celular se comparte directo. En la computadora se descarga el archivo y se abre el chat para adjuntarlo.
- **Limpiar filtro** vuelve a mostrar a todos.
- **Seguir a cobranza** pasa al paso 5.

Si falta el precio de alguien, el cierre te va a decir el cliente y el producto.

### 5. Cobranza al cliente

Cobrá lo del día. El cliente puede pagar en más de un medio y dejar una parte adeudada.

Medios: efectivo, transferencia, cheque y tarjeta.

- Ves el total, lo ya cobrado, cómo cobró, el saldo y el estado: sin cobrar, parcial o pagado.
- **Acciones** abre las opciones:
  - **Cobrar**, si todavía debe. Repartí el monto en los medios. Lo que no cargues queda adeudado. No se puede cobrar más que el saldo.
  - Si hay transferencia, identificá el depósito: el nombre de la cuenta como figura en el banco, a qué proveedor va y el monto. Si se reparte entre varios proveedores, usá **Otra línea**. La suma de las líneas tiene que ser igual a la transferencia.
  - **Ver detalle** muestra los productos de esa cuenta.
  - **Enviar saldo** arma el PDF con lo que ese cliente todavía debe y lo manda por WhatsApp.
  - **Avisar por WhatsApp** le manda el resumen de la cuenta de hoy.
  - **Editar lo cobrado**, si ya pagó algo. Ahí también se corrige el depósito.
  - **Eliminar cobro** deja de nuevo el saldo completo.
- En **Cómo cobró** queda el medio y, si hubo transferencia, la cuenta, el proveedor y el monto.
- **Seguir a pagar al proveedor** pasa al paso 6.

Podés cerrar el día aunque todavía no hayas cobrado a todos. Lo que quede pasa a **Cobranzas a clientes (pendientes)**.

### 6. Pagar al proveedor

Pagá lo que le debés a cada proveedor. El saldo es todo lo confirmado en recepción menos lo que ya pagaste, no solo lo de hoy.

Al proveedor se le paga en efectivo y en transferencia. Lo que no pagues queda adeudado.

- **Le debés** es el saldo.
- **Cómo pagaste** muestra los medios.
- Si un cliente pagó por transferencia y marcaste que ese dinero va a este proveedor, acá se lee **vino de** ese cliente, con la cuenta y el monto. Es una etiqueta para saber de quién es el depósito. No descuenta sola el pago: el pago al proveedor lo registrás vos con **Pagar**.
- **Mercadería de hoy** es lo que se confirmó en este pedido.
- **Pagar** registra el pago. Podés pagar una parte en cada medio o todo. No se puede pagar más que el saldo.
- Si queda saldo, lo vas a ver en **Pagos a proveedores (pendientes)**.
- **Seguir a cerrar el día** pasa al paso 10.

Podés cerrar el día aunque todavía le debas a algún proveedor.

### 7. Cobranzas a clientes (pendientes)

Lo que cada cliente todavía debe, de este día o de días anteriores. Cada fila es una carga.

- **Cobrar** anota el pago. También se puede partir en efectivo, transferencia, cheque y tarjeta, y dejar saldo. La transferencia se identifica igual que en el paso 5.
- **Enviar saldo** arma un PDF para ese cliente y lo manda por WhatsApp:
  - Arriba está el **Saldo a pagar**, en azul.
  - Cada día muestra la fecha, la **Carga** y, si ya pagó una parte, el pago en verde.
  - Si hay varios días y en alguno pagó una parte, ese día dice **Quedó de este día**.
  - La barra azul del final es el total que falta.
  - En el celular se comparte directo. En la computadora se descarga el PDF y se abre el chat para adjuntarlo.
- **WhatsApp** abre un aviso de esa cobranza.
- **Seguir a pagos pendientes** pasa al paso 8.

### 8. Pagos a proveedores (pendientes)

La misma lista de proveedores, pero solo los que todavía tienen saldo. El que está al día no aparece. Se paga igual que en el paso 6: efectivo, transferencia, o una parte de cada uno. También se ve de qué cliente vino cada depósito identificado.

### 9. Confirmar recepción (pendientes)

Para los días en los que la mercadería se recibe después. Elegí el día que todavía no recibiste y confirmá igual que en el paso 3. Sirve para confirmar hoy lo que se pidió ayer. **Llegó** y **Precio real** también se guardan solos.

### 10. Cerrar el día

Último paso. El resumen te dice si ya podés cerrar.

Para cerrar hace falta:

- Toda la recepción confirmada, incluso lo que llegó en 0.
- Precio al cliente en cada producto pedido.

No hace falta haber cobrado todo ni haberle pagado a todos los proveedores.

**Cerrar día** no se puede deshacer. Al cerrar, el stock de todos los productos se actualiza con lo que entró y lo que se vendió. El día cerrado se ve en **Historial de días**.

## Inicio

La pantalla de inicio muestra:

- Los productos más vendidos de la semana.
- Cuántos pedidos hay hoy.
- Cuánto falta cobrar.
- Cuánto falta pagar a proveedores.
- Cuántos productos están con stock bajo.

Si falta un paso del día, el cartel de arriba te dice cuál es el siguiente.

**Repartir efectivo** también está en el inicio.

## Repartir efectivo

**Historial → Repartir efectivo.** También se entra desde el inicio y desde **Caja**.

Sirve cuando entra efectivo de un cliente y, de eso, se le da una parte a uno o más proveedores. Los saldos bajan en el momento. Lo que no se reparte queda en la caja.

1. Elegí el cliente. Solo aparecen los que ya deben.
2. Poné el efectivo que entró. No puede ser más de lo que debe.
3. En **De eso le das**, elegí cada proveedor y el monto. Solo aparecen proveedores que ya tienen saldo. **Todo** completa lo que les debés, sin pasar el efectivo que entró.
4. El resumen muestra cuánto entró, cuánto repartís y cuánto queda en la caja.
5. **Descontar saldos** aplica el cobro al cliente y el pago a cada proveedor, todo en efectivo.

No se puede repartir más de lo que entró ni más de lo que le debés a un proveedor.

## Caja

**Historial → Caja.**

Muestra el dinero del día que elijas:

- **Ingresos:** lo cobrado a clientes.
- **Egresos:** lo pagado a proveedores.
- **Saldo del día:** ingresos menos egresos.
- **Saldo acumulado:** cómo viene la caja en el tiempo.

**Repartir efectivo** abre la pantalla del reparto.

## Historial de días

**Historial → Historial de Días.**

Lista los días ya cerrados.

- **Ver día** abre el detalle de esa fecha.
- **Reporte** arma el informe del día para imprimir o guardar como PDF.

## Stock de productos

**Configuración → Stock.**

Ahí está el stock de verduras y de bebidas. Cada producto nuevo entra con stock. El número se mueve al **cerrar el día**, con lo que llegó en la recepción menos lo que se vendió. Antes del cierre puede seguir mostrando el stock del último día cerrado.

- **Ajustar stock** o **Editar** corrige la cantidad a mano.
- **Verificar stock bajo** revisa qué productos están debajo del mínimo.
- **Configurar notificaciones** define el aviso de stock bajo.

El inicio avisa cuántos productos están bajos.

## Qué no tocar

**Configuración → Limpiar datos** borra todo: clientes, productos, proveedores, pedidos, cobros, pagos, caja, stock, camiones e historial. No se puede recuperar. No lo uses en el trabajo de todos los días.

## Si algo no cierra

| Lo que ves | Qué hacer |
| --- | --- |
| Sin proveedor | En el pedido, elegí el proveedor desde Acciones. Si el producto no tiene uno predeterminado, cargalo en Productos. El proveedor tiene que tener teléfono para el WhatsApp. |
| Falta teléfono | Cargalo en Clientes o en Proveedores. |
| No confirma la recepción | Si llegó mercadería, cargá el precio real por unidad. Si no llegó, poné 0. Los números se guardan solos; igual hay que apretar Confirmar. |
| La ganancia sigue en blanco | Escribí el precio al cliente. El cálculo aparece mientras escribís. Después usá Guardar precios. |
| Falta el precio al cliente | En Precios al cliente, completá el precio que indica el cierre y guardá. |
| No puedo cobrar o pagar ese monto | La suma supera el saldo. Cargá el saldo o menos. Lo que no cargues queda adeudado. |
| La transferencia no deja guardar | Poné el nombre de la cuenta y a qué proveedor va. Si hay varias líneas, tienen que sumar exactamente la transferencia. |
| En pagar al proveedor no dice de quién vino el depósito | Eso se carga al cobrar, en la transferencia. Si no se identificó ahí, no aparece. |
| En repartir efectivo no aparece el cliente o el proveedor | Solo entran los que ya tienen saldo. Primero tiene que haber un precio o una cobranza, y el proveedor tiene que deber. |
| El PDF de WhatsApp no sale adjunto en la computadora | Se descarga el archivo y se abre el chat. Adjuntalo a mano. En el celular se comparte directo. |
| El stock no cambió | El stock se actualiza al cerrar el día. |
