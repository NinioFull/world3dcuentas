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

## Agregar a inicio en el iPad

Abrir el Manager en Safari > Compartir > *Agregar a pantalla de inicio*. Queda con el ícono de WORLD3D y sin la barra del navegador.

## Aviso de pedido nuevo

Con el Manager abierto (por ejemplo en el iPad, en modo kiosco), cuando entra un pedido o un pago nuevo en la web suena una campanita, aparece un cartel arriba y el ícono muestra cuántos pedidos esperan algo de vos. Los pedidos se revisan cada 30 segundos. En iPad hay que tocar la pantalla una vez después de abrir la app para que el sonido quede habilitado (regla de iOS).

Con la pantalla apagada o la app cerrada, el aviso que llega es el de **Telegram** (el bot del sitio): instalá Telegram en el iPad con la misma cuenta.

## Contador de impresión

Cada trabajo guarda cuándo arrancó el tramo actual (`runStart`) y cuánto faltaba en ese momento (`remaining`). Cada pantalla calcula lo que falta con el reloj, sin escribir en la base, así tener varias pantallas abiertas ya no acelera el contador. Al pausar se congela lo que falta.

## Seguridad

La cola en Firebase solo la puede leer y escribir la cuenta admin (`firestore.rules`). El Manager entra a Firebase con la misma cuenta de Google que a Supabase, usando el token que trae la sesión justo después de entrar. Si un dispositivo pierde la conexión con Firebase, aparece "Conectar con Google" una vez.

Requisitos en Firebase: Authentication > Sign-in method > **Google** activado, y las reglas de `firestore.rules` publicadas en Firestore Database > Reglas.

## Modo demo

`REACT_APP_DEMO=1 npm start` muestra pedidos web de ejemplo (sin tocar Supabase). Ojo: la cola de Firebase sigue siendo la real y con las reglas puestas no se puede leer sin cuenta.

## Desarrollo

```
npm install
npm start
```
