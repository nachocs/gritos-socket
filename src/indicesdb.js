import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import iconv from 'iconv-lite';

const DIRECTORIO = '/home/dreamers/datos/indices/';
const BASE = DIRECTORIO + 'admin/sqlite/subindices.sqlite';
// los índices de fuera del árbol (enlaces simbólicos) se guardan con este prefijo
const RAICES_FUERA = [['/home/dreamers/www/foros', 'foros'], ['/home/gritos/www', 'gritos']];
const db_delim = '|';
const ascii = /^[\x00-\x7f]*$/;

// RECUERDA QUE ESTAS RUTIINAS NO SUBINDEXAN

// Fase 5 de la migración a SQLite (2026-10-09): las fichas de casi todos los índices ya NO tienen
// `.txt`; viven solo en la tabla `registro` de la base de subíndices (admin/sqlite/subindices.sqlite).
// Se lee de la tabla y, si la ficha no está, del `.txt` (los índices que aún lo conservan). Se
// escribe en la tabla cuando la ficha no tiene `.txt`; si lo tiene, en el `.txt` como siempre.
export class Indicesdb{
  constructor({ directorio = DIRECTORIO, base = BASE, raicesFuera = RAICES_FUERA } = {}){
    this.directorio = directorio;
    this.base = base;
    this.raicesFuera = raicesFuera;
    this.db = null;
    this.proximoIntento = 0;
    this.cacheCanon = new Map();
  }
  // nombre del índice tal como está en la tabla: la ruta real dentro del árbol (o bajo una raíz de fuera)
  canon(indice){
    const nombre = String(indice);
    if (this.cacheCanon.has(nombre)){ return this.cacheCanon.get(nombre); }
    let canon = nombre;
    try{
      const raizReal = fs.realpathSync(this.directorio);
      const real = fs.realpathSync(join(this.directorio, nombre));
      if (fs.statSync(real).isDirectory()){
        if (real.startsWith(raizReal + '/')){ canon = real.slice(raizReal.length + 1); }
        else {
          for (const [ruta, prefijo] of this.raicesFuera){
            if (real === ruta){ canon = prefijo; break; }
            if (real.startsWith(ruta + '/')){ canon = prefijo + '/' + real.slice(ruta.length + 1); break; }
          }
        }
      }
    } catch { /* no existe: el nombre tal cual */ }
    this.cacheCanon.set(nombre, canon);
    return canon;
  }
  abrir(){
    if (this.db){ return this.db; }
    if (Date.now() < this.proximoIntento){ return null; }
    try{
      if (!fs.existsSync(this.base)){ throw new Error('no existe ' + this.base); }
      const db = new DatabaseSync(this.base);
      db.exec('PRAGMA busy_timeout = 5000');
      this.sentencias = {
        leerAscii: db.prepare('SELECT CAST(texto AS BLOB) AS t FROM registro WHERE indice = ? AND entrada = ?'),
        leerBytes: db.prepare('SELECT CAST(texto AS BLOB) AS t FROM registro WHERE CAST(indice AS BLOB) = ? AND CAST(entrada AS BLOB) = ?'),
        poner: db.prepare('INSERT OR REPLACE INTO registro (indice, entrada, texto, mtime) VALUES (?,?,?,?)'),
      };
      this.db = db;
    } catch (error){
      this.proximoIntento = Date.now() + 30000;
      console.log('Error abrir la base de fichas', error.message);
    }
    return this.db;
  }
  // la ficha tal como está en la tabla (Buffer con los bytes del antiguo .txt), o undefined si no está
  registro(entrada, indice){
    if (!this.abrir()){ return undefined; }
    const ind = this.canon(indice);
    const ent = String(entrada);
    try{
      const fila = (ascii.test(ind) && ascii.test(ent))
        ? this.sentencias.leerAscii.get(ind, ent)
        : this.sentencias.leerBytes.get(Buffer.from(ind, 'latin1'), Buffer.from(ent, 'latin1'));
      return fila ? Buffer.from(fila.t) : undefined;
    } catch (error){
      console.log('Error leer registro', indice, entrada, error.message);
      return undefined;
    }
  }
  // el contenido de la ficha como cadena "binaria" (un carácter por byte), de la tabla o del .txt; lanza si no hay
  leer_texto(entrada, indice){
    const bytes = this.registro(entrada, indice);
    if (bytes){ return bytes.toString('latin1'); }
    return fs.readFileSync(this.directorio + indice + '/' + entrada + '.txt', { encoding: 'binary' });
  }
  leer_entrada_indice(entrada, indice, callback){
    let entryData;
    try{
      entryData = this.leer_texto(entrada, indice);
    } catch {
      setImmediate(() => {
        console.log('Error leer entrada indice', entrada, indice);
        callback(null);
      });
      return;
    }
    setImmediate(() => {
      const input = iconv.decode(Buffer.from(entryData, 'latin1'), 'ISO-8859-1');
      callback(this.parse(input, indice, entrada));
    });
  }
  parse(entryData, indice, entrada){
    entryData = entryData.replace(/\n$/,'');
    const entry = {};
    const array = entryData.split('\n');
    for (let i = 0, len = array.length; i< len; i++){
      const values = array[i].split('|');
      values[1] = values[1].replace(/~~/ig, '|');
      values[1] = values[1].replace(/``/ig, '\n');
      entry[values[0]] = values[1];
    }
    entry['NUMERO_ENTRADA'] = entrada;
    entry['INDICE'] = indice;
    return entry;
  }
  leer_entrada_indiceSync(entrada, indice){
    let entry;
    try{
      const input = this.leer_texto(entrada, indice);
      entry = iconv.decode(Buffer.from(input, 'latin1'), 'ISO-8859-1');

    } catch {
      console.log('Error leer entrada indice sync', entrada, indice);
      return null;
    }
    entry = this.parse(entry, indice, entrada);
    return entry;
  }
  modificar_entrada_indiceSync(indice, entrada, subindice, subdato){
    const entry = this.leer_entrada_indiceSync(entrada, indice);
    if (!entry){return null;}
    entry[subindice] = subdato;
    this.escribir_entrada_indiceSync(indice, entrada, entry);
    return entry;
  }
  escribir_entrada_indiceSync(indice, entrada, rec){
    if (!indice || !entrada || !rec){
      return null;
    }
    let fichero = '';
    // inicio algunas variables
    const time = Math.floor( Date.now() / 1000 );
    rec['FECHA_M'] = time;  // Fecha de modificación: siempre se sobreescribe
    if (!rec['FECHA']){ rec['FECHA'] = time; }
    if (!rec['FECHA_A']){ rec['FECHA_A'] = time; } // Fecha de creación. solo una vez.
    rec['ID'] = entrada;
    rec['INDICE'] = indice;
    Object.keys(rec).forEach((key)=>{
      rec[key] = this.prepararparadb(rec[key]);
      fichero += key + db_delim + rec[key] + '\n';
    });
    try{
      const ruta = this.directorio + indice + '/' + entrada + '.txt';
      // sin .txt, la ficha vive solo en la tabla (fase 5): se actualiza allí, en latin-1 como el resto
      if (!fs.existsSync(ruta) && this.registro(entrada, indice) !== undefined){
        this.sentencias.poner.run(this.canon(indice), String(entrada), Buffer.from(fichero, 'latin1'), Math.floor(Date.now() / 1000));
        return;
      }
      fs.writeFileSync(ruta, fichero, { encoding: 'utf-8' });
    } catch {
      console.log('Error escribir entrada indice sync', entrada, indice);
      return null;
    }
  }

// rutina de apoyo db
// usar prepararparadb(variable) para devolver la variable preparada para escribir en la db
// usar prepararparadb(variable,'a') para devolver la variable preparada para leer de la db
  prepararparadb(entrada, variante){
    if (entrada && typeof entrada === 'string'){
      if (variante){
        entrada = entrada.replace(/~~/g, '|');
        entrada = entrada.replace(/``/g, '\n');
      } else{
        entrada = entrada.replace(/\|/g, '~~');
        entrada = entrada.replace(/\cM\n/g, '\n');
        entrada = entrada.replace(/\n\cM/g, '\n');
        entrada = entrada.replace(/\cM/g, '\n');
        entrada = entrada.replace(/\n/g, '``');
      }
    }
    return entrada;
  }
  last_num(indice){ // SYNC
    let logfile, data;
    let logRoom = indice.replace(/\/$/, '').replace(/\//ig, '.');
    if((/^gritos\//).test(indice) && !(/\d+$/).test(indice)){
      logRoom = logRoom.replace(/gritos\./,'');
      logfile = `/home/gritos/www/admin/logs/${logRoom}.num.txt`;
    } else {
      logfile = `/home/indices/admin/logs/${logRoom}.num.txt`;
    }
    // console.log('logfile es ', logfile);
    try{
      data = fs.readFileSync(logfile, { encoding: 'utf8' });
    } catch {
      console.log('Error last_num', indice);
      return null;
    }
    data = data.replace(/\n$/,'');
    return Number(data);
  }
}
export default new Indicesdb();
