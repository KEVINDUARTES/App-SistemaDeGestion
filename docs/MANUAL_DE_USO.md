# Manual de uso — Luciano Cargas

Guía corta para usar la app todos los días. El menú de la izquierda sigue el orden del trabajo. En el celular, la barra de abajo recorre el mismo camino: Pedidos, Recepción, Precios, Cobro, Pago y Cierre.

## Para qué sirve

La app organiza un día de reparto:

1. Anotás qué pidió cada cliente.
2. Se lo mandás al proveedor.
3. Cuando llega la mercadería, confirmás cuánto vino y a qué costo.
4. Armás el precio para el cliente y se lo enviás.
5. Cobrás al cliente y le pagás al proveedor.
6. Cerrás el día.

El pago al proveedor no se carga en Pedidos. Se carga recién en **Pagar al proveedor**.

## Cómo entrar

1. Abrí la app.
2. Poné tu correo y tu contraseña.
3. Para salir, usá **Salir**, arriba a la derecha.

Arriba de cada pantalla del día aparece **Pedido del día**. Si la mercadería de ayer llega hoy, elegí la fecha de ayer y seguí con esa misma fecha en recepción, precios y cierre.

## Antes del primer día

Cargá esto una sola vez, en **Configuración**. Después solo lo tocás cuando hay alguien nuevo o un producto nuevo.

### Clientes

**Configuración → Clientes → Agregar cliente.**

- Nombre.
- Teléfono de WhatsApp. Sin teléfono no se le puede mandar la lista de precios.

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
- Proveedor predeterminado. Es quien recibe el pedido de ese producto. Si queda vacío, el pedido aparece como **Sin proveedor** y no se puede enviar.

## El día, paso a paso

### 1. Pedidos del día

Anotá cada pedido: cliente, producto y cantidad.

- **Agregar pedido** carga uno nuevo.
- En **Acciones** podés editarlo, eliminarlo o cambiar el proveedor.
- **Enviar pendientes a proveedores** abre un mensaje de WhatsApp por cada proveedor, con todo lo que le corresponde.
- Cuando un pedido ya se envió, figura **Enviado**. Podés reenviarlo desde Acciones.
- **Seguir a recepción** pasa al paso 2. No hace falta haber enviado todo para seguir, pero conviene mandarlo antes de que salga el proveedor.

### 2. Confirmar recepción

Cuando llega la mercadería, confirmá **cada producto**.

- **Pedido** es lo que se pidió, sumando a todos los clientes.
- **Llegó** es lo que vino de verdad. Si pediste 10 y vinieron 8, poné 8.
- Si no vino nada, poné **0** y confirmá igual. Si no lo confirmás, el día no se puede cerrar.
- **Precio real** es lo que te cobró el proveedor **por una unidad** (un kg, una caja, una unidad). No es el total del pedido y no es el precio al cliente. Si llegaron 9 cajas, cargá el costo de una caja.
- Si llegó algo y no cargaste el precio real, no te deja confirmar.
- **Guardar borrador** guarda los números sin confirmar.
- **Confirmar todos los completos** confirma de una vez los productos que ya tienen cantidad y precio.
- Al confirmar, la app arma sola la lista de precios al cliente, con la cantidad que llegó. Si faltó mercadería, esa cantidad se reparte entre los clientes que la pidieron.

### 3. Precios al cliente

Acá definís cuánto le cobrás a cada cliente por cada unidad.

- **Precio real** ya viene de la recepción. No lo cambies acá.
- **Precio cliente** es lo que le cobrás vos por cada unidad.
- **Ganancia** es la diferencia entre el precio al cliente y el costo del proveedor.
- **Comisión de reparto por unidad** se suma aparte. No está incluida en la ganancia. El total del cliente es precio más comisión.
- **Armar lista** vuelve a armar la lista con lo confirmado en recepción. Usalo si cambiaste una recepción.
- **Guardar precios** guarda y actualiza lo que hay que cobrar.
- Para mandar la lista, primero elegí **un cliente** en el filtro.
  - **WhatsApp** abre el mensaje para ese cliente.
  - **PDF** arma la lista para imprimir o compartir.
- **Limpiar filtro** vuelve a mostrar a todos.
- **Seguir a cobranza** pasa al paso 4.

Si falta el precio de alguien, el cierre te va a decir el cliente y el producto.

### 4. Cobranza al cliente

Cobrá lo del día.

- Ves el total, lo ya cobrado, el saldo y el estado: sin cobrar, parcial o pagado.
- **Cobrar** registra el pago. Podés cobrar una parte. El resto queda pendiente.
- No se puede cobrar más que el saldo.
- Métodos: efectivo, transferencia o cheque.
- **Seguir a pagar al proveedor** pasa al paso 5.

Podés cerrar el día aunque todavía no hayas cobrado a todos.

### 5. Pagar al proveedor

Pagá lo que le debés a cada proveedor. El saldo es todo lo confirmado en recepción menos lo que ya pagaste, no solo lo de hoy.

- **Le debés** es el saldo.
- **Mercadería de hoy** es lo que se confirmó en este pedido.
- **Pagar** registra el pago. Podés pagar una parte o todo.
- No se puede pagar más que el saldo.
- **WhatsApp** le avisa al proveedor.
- Si queda saldo, lo vas a ver en **Pagos a proveedores (pendientes)**.
- **Seguir a cerrar el día** pasa al paso 8.

Podés cerrar el día aunque todavía le debas a algún proveedor.

### 6. Cobranzas a clientes (pendientes)

Lo que el cliente todavía no pagó. Sirve para cobrar deudas de este día o de días anteriores.

- **Ver** muestra el detalle.
- **Registrar cobro** anota el pago.
- **Seguir a pagos pendientes** pasa al paso 7.

### 7. Pagos a proveedores (pendientes)

La misma lista de proveedores, pero solo los que todavía tienen saldo. El que está al día no aparece.

### 8. Cerrar el día

Último paso. El resumen te dice si ya podés cerrar.

Para cerrar hace falta:

- Toda la recepción confirmada, incluso lo que llegó en 0.
- Precio al cliente en cada producto pedido.

No hace falta haber cobrado todo ni haberle pagado a todos los proveedores.

**Cerrar día** no se puede deshacer. Al cerrar, el stock de bebidas se actualiza con lo que entró y lo que se vendió. El día cerrado se ve en **Historial de días**.

## Inicio

La pantalla de inicio muestra:

- Los productos más vendidos de la semana.
- Cuántos pedidos hay hoy.
- Cuánto falta cobrar.
- Cuánto falta pagar a proveedores.
- Cuántas bebidas están con stock bajo.

Si falta un paso del día, el cartel de arriba te dice cuál es el siguiente.

## Stock de bebidas

**Configuración → Stock de Bebidas.**

El stock de bebidas se mueve al **cerrar el día**, no en el momento de la recepción. Antes del cierre puede seguir mostrando el stock del último día cerrado.

- **Ajustar stock** corrige la cantidad a mano.
- **Verificar stock bajo** revisa qué productos están debajo del mínimo.
- **Configurar notificaciones** define el aviso de stock bajo.

Las verduras no llevan stock.

## Caja

**Historial → Caja.**

Muestra el dinero del día que elijas:

- **Ingresos:** lo cobrado a clientes.
- **Egresos:** lo pagado a proveedores.
- **Saldo del día:** ingresos menos egresos.
- **Saldo acumulado:** cómo viene la caja en el tiempo.

## Historial de días

**Historial → Historial de Días.**

Lista los días ya cerrados. **Ver día** abre el detalle de esa fecha.

## Qué no tocar

**Configuración → Limpiar datos** borra todo: clientes, productos, proveedores, pedidos, cobros, pagos, caja, stock e historial. No se puede recuperar. No lo uses en el trabajo de todos los días.

## Si algo no cierra

| Lo que ves | Qué hacer |
| --- | --- |
| Sin proveedor | Entrá al producto y elegí un proveedor predeterminado. El proveedor tiene que tener teléfono. |
| Falta teléfono | Cargalo en Clientes o en Proveedores. |
| No confirma la recepción | Si llegó mercadería, cargá el precio real por unidad. Si no llegó, poné 0. |
| Falta el precio al cliente | En Precios al cliente, completá el precio que indica el cierre y guardá. |
| No puedo cobrar o pagar ese monto | El monto es mayor que el saldo. Cargá el saldo o menos. |
| El stock de bebidas no cambió | El stock se actualiza al cerrar el día. |
