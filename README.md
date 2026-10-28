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

## Modo demo

`REACT_APP_DEMO=1 npm run build` (o `npm start`) entra sin cuenta y muestra pedidos web de ejemplo, para probar la pestaña Web sin tocar la base. La cola sigue siendo la real de Firebase.

## Pendiente de seguridad

El login protege la pantalla, pero la base de Firebase (cola, clientes, productos) sigue con reglas abiertas: cualquiera con el ID del proyecto puede leerla y escribirla. Próximo paso: reglas de Firestore que solo acepten la cuenta admin.

## Desarrollo

```
npm install
npm start
```
