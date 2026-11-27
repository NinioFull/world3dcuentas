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

Arriba se elige **Pedidos** (todos los trabajos por etapa en tarjetas grandes: En cola, Imprimiendo, Listos y Para entregar, cada uno con su botón; en vertical se ven una etapa debajo de la otra) o **Calendario** (las entregas de la semana, un día por columna; con el iPad parado se ve como agenda, un día por fila). Tocando una entrega se ve el detalle y su acción principal (iniciar, terminado, entregado…). Las flechas cambian de semana y *Hoy* vuelve a la actual. La vista elegida queda guardada en el iPad.

## Agregar a inicio en el iPad

Abrir el Manager en Safari > Compartir > *Agregar a pantalla de inicio*. Queda con el ícono de WORLD3D y sin la barra del navegador.

## Aviso de pedido nuevo

Con el Manager abierto (por ejemplo en el iPad, en modo kiosco), cuando entra un pedido o un pago nuevo en la web suena una campanita, aparece un cartel arriba y el ícono muestra cuántos pedidos esperan algo de vos. Los pedidos llegan en vivo (Supabase Realtime sobre la tabla `pedidos`, activado con `alter publication supabase_realtime add table public.pedidos;`) y además se revisan cada 60 segundos por las dudas. En iPad hay que tocar la pantalla una vez después de abrir la app para que el sonido quede habilitado (regla de iOS).

Con la pantalla apagada o la app cerrada, el aviso que llega es el de **Telegram** (el bot del sitio): instalá Telegram en el iPad con la misma cuenta.

## Contador de impresión

Cada trabajo guarda cuándo arrancó el tramo actual (`runStart`) y cuánto faltaba en ese momento (`remaining`). Cada pantalla calcula lo que falta con el reloj, sin escribir en la base, así tener varias pantallas abiertas ya no acelera el contador. Al pausar se congela lo que falta.

## Datos al día (kiosco)

La cola escucha a Firestore en vivo. Si la conexión se corta y no vuelve sola (por ejemplo el iPad días en kiosco y iOS suspendiendo la app), el Manager lo detecta: reconecta a los 1,5 min, recarga la página a los 6 min (si no estás cargando un pedido), recarga al volver a la app después de 30 min dormida, y el kiosco se recarga solo una vez de madrugada (4:00). Mientras no está al día muestra *Reconectando… · Actualizar ahora*; el kiosco muestra *En vivo* cuando todo está bien.

El cierre automático de impresiones terminadas solo corre con datos al día y con una transacción que vuelve a leer del servidor: una pantalla con datos viejos ya no puede pisar un trabajo entregado.

## Rapidez

- Solo se arma la pantalla que estás viendo (antes se armaban las 7 en cada actualización del reloj de 20 s).
- La librería de Excel se baja recién al tocar *Exportar* (~280 KB menos al abrir).
- `public/sw.js` guarda la app y las fuentes en el dispositivo: abre al instante. La página siempre se pide primero a internet (versión nueva); los datos (Firebase, Supabase) nunca pasan por el caché.
- Esqueleto con forma de tarjetas en `public/index.html` mientras arranca, y en la app mientras llega la cola.
- Listas largas con `content-visibility: auto`: lo que está fuera de pantalla no se dibuja.

## Estilo

Estilos globales en `src/estilos.css`. Escala única: letra 12·13·14·16·18·20·22·24·28·32, bordes `C.rXs/rSm/rMd/r/rPill`, espacios de a 2 px. Fuentes Rubik y Outfit desde `index.html`. Transiciones cortas (pestañas, ventanas, destello al cambiar de etapa) que se apagan con *Reducir movimiento*.

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

## Alexa: "Mi taller"

Consultar el Manager por voz desde el parlante: *"Alexa, abre mi taller"* (resumen del día) o *"Alexa, pregúntale a mi taller…"*:

| Preguntás | Te dice |
|---|---|
| qué tengo para hoy · cómo va el taller | entregas de hoy, qué imprime cada máquina, cola, listos, atrasados y pedidos web |
| qué se está imprimiendo · cuánto le falta a la ka uno | trabajo, minutos que faltan y a qué hora termina (o si está libre y qué sigue) |
| qué hay en cola · qué sigue | cantidad, horas de impresión y los próximos trabajos |
| qué entregas tengo (hoy, mañana, el viernes…) | entregas de ese día y lo listo sin recoger |
| qué está atrasado | trabajos con entrega vencida |
| cuánto me deben | por cobrar y quién quedó debiendo |
| cuánto cobré (hoy, esta semana, este mes) | adelantos + saldos, con las mismas cuentas que el resumen semanal |
| hay pedidos en la web | pagados para pasar a la cola, esperando pago y cotizaciones |
| anota diez llaveros negros para Linda por ciento cincuenta bolivianos | arma el pedido y pregunta lo que falte (producto, cliente, precio, adelanto); lo lee y **solo lo guarda si decís que sí** |

**Anotar pedidos**: el trabajo entra a la cola como uno cargado a mano (estado *En cola*, primera impresora, nota "Anotado por voz con Alexa"). Con el catálogo completa material, color, tiempo y peso; si el precio es cero usa el precio de lista × cantidad. Si el cliente ya existe (nombre completo, o solo el nombre cuando hay uno solo así) copia su teléfono. La cantidad, si no se dice, es 1. El color se reconoce si va en la frase. Si Alexa repite el pedido no se duplica (id fijo por sesión y datos).

Fuera de anotar pedidos, solo lee. El código está en `api/alexa.mjs` (endpoint) y `alexa/` (firma de Amazon, lectura de Firestore/Supabase y frases). El modelo de voz está en `alexa/modelo/` (se genera con `node alexa/modelo/generar.mjs`; para cambiar frases o productos editá ese archivo, regenerá y pegá el JSON en la consola de Alexa › JSON Editor › Save › Build skill).

### Activarla (una sola vez)

1. **Firebase**: Configuración del proyecto › Cuentas de servicio › *Generar nueva clave privada*. Baja un `.json`.
2. **Vercel** (proyecto del Manager) › Settings › Environment Variables:
   - `FIREBASE_SERVICE_ACCOUNT`: todo el contenido del `.json`.
   - `SUPABASE_SECRET_KEY` (opcional, para los pedidos web): Supabase › Project Settings › API Keys › clave secreta (`sb_secret_…`) o la `service_role`.
3. **Consola de Alexa** (developer.amazon.com/alexa/console/ask, con la misma cuenta de Amazon del parlante): *Create Skill* › nombre "Mi taller", idioma **Spanish (US)** (o el que tenga el parlante), tipo *Other* › *Custom* › *Provision your own* › *Start from scratch*.
   - Build › Interaction Model › **JSON Editor**: pegar `alexa/modelo/es-US.json` (o `es-MX.json`) › *Save* › *Build skill*.
   - Build › **Endpoint** › HTTPS › Default Region: `https://DOMINIO-DEL-MANAGER/api/alexa` y en el certificado elegir *My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority* (para `*.vercel.app`; con dominio propio, la primera opción).
   - Copiar el **Skill ID** (`amzn1.ask.skill.…`, arriba en Endpoint) y ponerlo en Vercel como `ALEXA_SKILL_ID`.
4. Vercel › Deployments › *Redeploy* para que tome las variables.
5. Consola de Alexa › **Test** › *Skill testing is enabled in: Development*. Ya funciona en todos los parlantes de esa cuenta, sin publicarla.

Seguridad: el endpoint solo responde a pedidos firmados por Amazon (certificado, firma SHA-256 y hora) y con el Skill ID de `ALEXA_SKILL_ID`. La clave de Firebase queda solo en Vercel.

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

### Arranque rápido
- Entra con la sesión guardada en el dispositivo y no espera la consulta de admin si ya se confirmó antes en ese aparato (se vuelve a confirmar por detrás; si la cuenta deja de ser admin, sale).
- Al volver a la app después de un rato ya no recarga la página entera: se reconecta. Si en 6 min no quedó al día, recién ahí recarga.
- En la app instalada (iPad/celu) el caché de la cola toma el control al instante en vez de esperar a una ventana anterior cerrada de golpe.
- En "Más" (o abajo del menú lateral) dice cuánto tardó en abrir la última vez: "Abrió en X s · en vivo en Y s".

### Puente de impresoras (estado real de cada máquina)
- Un programita (`public/puente/puente.mjs`, Node 22+, sin dependencias) corre en la PC del taller (principal) y en un celular Android con Termux (respaldo). Busca solas las impresoras del wifi: Creality con Creality OS (K1 Max, Hi…) por el puerto 9999 y Elegoo Centauri Carbon 2 por MQTT. La de resina no tiene wifi.
- Manda lo que ve a `/api/puente`, que lo guarda en `maquinas/<id>` con la cuenta de servicio de Firebase (la misma de Alexa). La clave la crea el Manager en Máquinas → Conexión y queda en `config/puente`.
- El celular pregunta antes si la PC latió en los últimos ~3 minutos: si sí, queda en espera sin conectarse a las impresoras; si no, toma el control.
- Cuando una máquina termina de verdad se cierra el trabajo que imprimía en ella (`finImpresora`, y Telegram como siempre). Varias unidades con mucho por delante = terminó una tanda: queda en pausa con lo que falta.
- Mientras una máquina dice que sigue imprimiendo, ni el Manager ni el Apps Script cierran el trabajo por tiempo. El avance y lo que falta salen de la impresora ("según la impresora").
- Avisos arriba de cada pantalla y en el kiosco: imprime algo sin pedido (elegís cuál con un toque), pausa, cancelación, error, impresora nueva sin identificar. Telegram avisa pausas, cancelaciones, errores y si una se apaga en plena impresión.
- Instalar: Máquinas → Conexión con las impresoras → Instalar. PC: `irm https://world3dcuentas.vercel.app/puente/instalar.ps1 | iex` en PowerShell. Celu: Termux + Termux:Boot (F-Droid) y `curl -fsSL https://world3dcuentas.vercel.app/puente/instalar-celu.sh | bash`.
- Pruebas sin red: `node impresoras/prueba.mjs`.
