# gritos-socket
Socket system for gritos.com

## Notificaciones y sesion

`prepararNotificaciones(userId, uid)`: el cliente manda el ID y su sesion (`uid`). El servidor lee el fichero
`/home/dreamers/datos/indices/admin/auth/<uid>` (lo escribe el login: `<ID>: <ip>`) y comprueba que el dueno es `userId`.

- `GRITOS_SOCKET_AUTH=exigir` (drop-in de systemd): sin sesion valida no se vigila nada.
- Sin la variable: solo lo apunta en el log (`prepararNotificaciones SIN sesion valida`) y lo deja pasar.

Por el socket NUNCA salen email, clave, nombre, nacimiento, IP ni sesion (`src/privacidad.js`). Pruebas: `npm test`
(`test/app.test.js` levanta un servidor de socket.io real con fichas de mentira).
