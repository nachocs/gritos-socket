> **RETIRADO el 2026-10-15.** gritos.com ya no usa este servicio: los avisos, los gritos en vivo, el Web Push y la vista previa de enlaces los da el servicio
> `dreamers-notificaciones` (ver ese repo, `README.md` y `PENDIENTES.md`). La unidad `gritos-socket` esta parada y deshabilitada en el servidor (`systemctl enable --now gritos-socket`
> la devuelve; el codigo sigue en `/home/gritos/socket/gritos-socket`), y el proxy `/ws/` de `gritosssl.conf` (ahora responde 410) y el vhost `socket.gritos.com` se quitaron.
> Copia de las configuraciones anteriores: `/home/nacho/backups/apagar-gritos-socket-20261015183023`. Este repo se conserva solo como historia.

# gritos-socket
Socket system for gritos.com

## Notificaciones y sesion

`prepararNotificaciones(userId, uid)`: el cliente manda el ID y su sesion (`uid`). El servidor lee el fichero
`/home/dreamers/datos/indices/admin/auth/<uid>` (lo escribe el login: `<ID>: <ip>`) y comprueba que el dueno es `userId`.

- `GRITOS_SOCKET_AUTH=exigir` (drop-in de systemd): sin sesion valida no se vigila nada.
- Sin la variable: solo lo apunta en el log (`prepararNotificaciones SIN sesion valida`) y lo deja pasar.

Por el socket NUNCA salen email, clave, nombre, nacimiento, IP ni sesion (`src/privacidad.js`). Pruebas: `npm test`
(`test/app.test.js` levanta un servidor de socket.io real con fichas de mentira).
