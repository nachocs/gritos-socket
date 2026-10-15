#!/usr/bin/env node
import fs from 'node:fs';
import https from 'node:https';
import express from 'express';
import { Server } from 'socket.io';
import { App } from './app.js';

const app = express();
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/gritos.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/gritos.com/cert.pem'),
  ca: fs.readFileSync('/etc/httpd/certs/rapidssl_sha256_ca.crt'),
  requestCert: false,
};
const server = https.createServer(options, app);
const io = new Server(server, {
  // The currently-deployed production frontend still ships socket.io-client
  // 1.7.3 (Engine.IO v3); this lets it keep connecting to this v4 server so
  // the socket upgrade can deploy independently of the React migration.
  // Drop once the legacy Backbone bundle is fully retired.
  allowEIO3: true,
  cors: {
    origin: ['https://gritos.com', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
  },
});

// un fallo suelto en una lectura de ficha no debe tumbar el servicio y cortar a todos los conectados
process.on('uncaughtException', (error) => console.log('uncaughtException', error.stack || error.message));
process.on('unhandledRejection', (error) => console.log('unhandledRejection', error && (error.stack || error.message)));

const socketApp = new App({ io, server, app });
export default socketApp;
