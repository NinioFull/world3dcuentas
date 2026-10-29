# WORLD3D Manager

Panel de producción de WORLD3D: cola de impresión, envíos, clientes, stats, productos y máquinas. Pensado para dejarlo fijo en el iPad al lado de las impresoras (modo kiosco) y también en el celular.

## Pedidos web (pestaña 🌐 Web)

Los pedidos que entran por world3d.com.bo viven en Supabase (la misma base del sitio). El Manager los lee desde ahí:

- **Esperando pago** → botón *Pago confirmado* (pregunta si ya viste el dinero en el banco) o *Recordar* por WhatsApp.
- **Pagados** → *Pasar a la cola*: crea un trabajo por cada ítem (con el pago ya cargado como adelanto, el color y el teléfono del cliente) y pone el pedido *en producción* en el sitio.
- **En producción** → cuando todos sus trabajos quedan *Listo*, el pedido pasa solo a *listo* en el sitio; cuando todos se entregan, a *entregado*. El seguimiento del cliente se mueve solo.
- Cada tarjeta tiene *Avisar*: abre WhatsApp con el mismo mensaje que usa el panel del sitio para ese estado.

Los pedidos se actualizan al entrar, cada minuto y cada vez que volvés a la app.

## Cuenta

Se entra solo con Google, con la cuenta admin de WORLD3D (la que está en la tabla `admins` de Supabase). Para que el login funcione desde el Manager hay que agregar su dirección en Supabase:

1. Supabase > Authentication > URL Configuration > **Redirect URLs**: agregar `https://TU-DOMINIO-DEL-MANAGER/**` (la URL de Vercel donde está publicado, y `http://localhost:3000/**` si lo probás en la compu).
2. Listo: el botón *Entrar con Google* usa el mismo Client ID que el sitio.

## Modo kiosco

Arriba se elige **Máquinas** (una columna por impresora con lo que imprime y lo que sigue) o **Calendario** (las entregas de la semana, un día por columna; con el iPad parado se ve como agenda, un día por fila). Tocando una entrega se ve el detalle y su acción principal (iniciar, terminado, entregado…). Las flechas cambian de semana y *Hoy* vuelve a la actual. La vista elegida queda guardada en el iPad.

## Agregar a inicio en el iPad

Abrir el Manager en Safari > Compartir > *Agregar a pantalla de inicio*. Queda con el ícono de WORLD3D y sin la barra del navegador.

## Aviso de pedido nuevo

Con el Manager abierto (por ejemplo en el iPad, en modo kiosco), cuando entra un pedido o un pago nuevo en la web suena una campanita, aparece un cartel arriba y el ícono muestra cuántos pedidos esperan algo de vos. Los pedidos llegan en vivo (Supabase Realtime sobre la tabla `pedidos`, activado con `alter publication supabase_realtime add table public.pedidos;`) y además se revisan cada 60 segundos por las dudas. En iPad hay que tocar la pantalla una vez después de abrir la app para que el sonido quede habilitado (regla de iOS).

Con la pantalla apagada o la app cerrada, el aviso que llega es el de **Telegram** (el bot del sitio): instalá Telegram en el iPad con la misma cuenta.

## Contador de impresión

Cada trabajo guarda cuándo arrancó el tramo actual (`runStart`) y cuánto faltaba en ese momento (`remaining`). Cada pantalla calcula lo que falta con el reloj, sin escribir en la base, así tener varias pantallas abiertas ya no acelera el contador. Al pausar se congela lo que falta.

## Sin conexión

La cola se guarda en el dispositivo (caché de Firestore en IndexedDB). Si se corta el internet se sigue viendo todo y lo que tocás se guarda al instante; se sube solo cuando vuelve la señal. Arriba aparece un aviso mientras no hay conexión. La pestaña Web sí necesita internet.

## Plata

- **Cobrado**: adelantos (el día que se tomó el pedido) + saldos (el día que se cobraron: al entregar, o después si quedó debiendo).
- **Vendido**: suma de los pedidos por fecha en que se tomaron, cobrados o no.
- **Por cobrar**: precio − adelanto de lo que todavía no se entregó, más lo que se entregó y quedó debiendo.

Al marcar *Entregado* un trabajo con saldo, el Manager pregunta si se cobró en **efectivo**, por **QR / transferencia**, o si **queda debiendo** (`debe: true`). Lo que se debe aparece en Inicio (*Para hacer seguimiento*), en Envíos (*Te deben*) y en la ficha del cliente, con el botón *Cobrar*.

## Ganancia, mantenimiento y fallas

- **Ganancia real**: cada trabajo calcula su costo (filamento según el costo por kg del material + horas de máquina × (luz + desgaste)) y muestra *Ganás Bs X · %*. Si el margen queda debajo del mínimo, avisa *Precio bajo* con el precio sugerido. En Stats › Utilidad se ve la utilidad neta del período (filamento, máquina y fallas aparte), la lista de trabajos con margen bajo y se editan luz/hora, desgaste/hora y margen mínimo (`config/operacion`).
- **Mantenimiento**: en Máquinas, cada impresora muestra las horas impresas y sus tareas (cada X horas). *Hecho* reinicia la cuenta; tocando "cada X h" se cambia el intervalo. Lo vencido aparece en Inicio y en el kiosco. Se guarda en el campo `mant` de cada impresora; la primera vez arranca desde las horas que ya tenía.
- **Fallas**: botón *Falló* en lo que se imprime, está pausado o recién terminado (también en el kiosco). Se anota el motivo y el filamento perdido (colección `fallas`) y el trabajo vuelve a la cola. Las horas impresas antes de fallar cuentan para el mantenimiento.
- **Nota de entrega**: botón *Nota* en lo listo o entregado. Arma una imagen con el logo (productos, total, adelanto, pagado o saldo). En iPad/celu se comparte directo a WhatsApp; en la compu se descarga y abre el chat del cliente.
- **Para recontactar** (Clientes): quienes compraron y no piden hace más de 2 meses, ordenados por lo que gastaron, con *Escribir* (WhatsApp con mensaje armado) o *Ahora no*. No vuelven a aparecer por 30 días (`config/recontactos`).

## Uso diario

- **Buscador**: la lupa del encabezado (o la tecla `/`) busca clientes, teléfonos, productos, notas y pedidos web.
- **Ficha del cliente**: tocá el nombre del cliente en cualquier tarjeta. Muestra lo que gastó, lo que debe, desde cuándo es cliente y lo que más pide, con *Nuevo pedido* y *WhatsApp*.
- **Sin recoger**: lo que está listo hace más de 3 días aparece en Inicio con *Recordar* (WhatsApp con el mensaje armado; queda anotado cuándo se le recordó).
- **Deslizar** (celu/iPad): una tarjeta a la derecha hace la acción principal (iniciar, listo, entregar…); a la izquierda pausa la impresión. Todo con *Deshacer*.

## Respaldo y resumen semanal

Todos los lunes a las 8:00 (hora de Bolivia), un Apps Script en la cuenta dueña del proyecto de Firebase (proyecto *WORLD3D Respaldo semanal* en script.google.com) hace dos cosas:

- **Respaldo**: copia trabajos, productos, impresoras y stock a una hoja de cálculo nueva en Drive, carpeta *WORLD3D · Respaldos del Manager*. Quedan las últimas 8 semanas; las más viejas van a la papelera.
- **Resumen por Telegram**: cobrado, vendido, entregados, por cobrar, cola, listos, atrasados y lo más pedido de la semana pasada, con el enlace al respaldo. Lo manda la función `resumen-semanal` de Supabase con el mismo bot del sitio. Si Telegram falla, llega por correo.

Además, cada 5 minutos revisa si terminó una impresión y manda un Telegram (*Terminó: … · Sigue en esa impresora: …*). Si no hay ninguna pantalla abierta, cierra el trabajo como lo haría el Manager. Solo avisa de lo que terminó solo por el contador (`finAuto`), no de lo que marcás a mano.

El código está en `respaldo/` (`Codigo.gs` y `appsscript.json`). Para reinstalarlo: pegar ambos archivos en un proyecto de Apps Script, agregar la propiedad de script `RESUMEN_SECRETO` (la misma clave que el secreto homónimo de Supabase) y ejecutar `instalar()` una vez. Para probar sin esperar al lunes, ejecutar `semanal()`.

## Seguridad

La cola en Firebase solo la puede leer y escribir la cuenta admin (`firestore.rules`). El Manager entra a Firebase con la misma cuenta de Google que a Supabase, usando el token que trae la sesión justo después de entrar. Si un dispositivo pierde la conexión con Firebase, aparece "Conectar con Google" una vez.

Requisitos en Firebase: Authentication > Sign-in method > **Google** activado, y las reglas de `firestore.rules` publicadas en Firestore Database > Reglas.

## Modo demo

`REACT_APP_DEMO=1 npm start` entra sin cuenta con datos de ejemplo: pedidos web y una cola de prueba en memoria (`src/datos.js`). No lee ni escribe tu cola real, así que se puede probar todo (borrar, iniciar, pasar a la cola) sin riesgo.

## Desarrollo

```
npm install
npm start
```
