import fs from 'fs';
const directorio = '/home/dreamers/datos/indices/';

class Indicesdb{
  leer_entrada_indice(entrada, indice, callback){
    fs.readFile(directorio + indice + '/' + entrada + '.txt', { encoding: 'utf8' }, (entryErr, entryData) => {
      if (entryErr){
        console.log('leer entrada indice Error', entryErr);
        callback(null);
      } else {
        const entry = this.parse(entryData, indice, entrada);
        callback(entry);
      }
    });
  }
  parse(entryData, indice, entrada){
    entryData = entryData.replace(/\n$/,'');
    const entry = {};
    const array = entryData.split('\n');
    for (let i = 0, len = array.length; i< len; i++){
      const values = array[i].split('\|');
      values[1] = values[1].replace(/~~/ig, '\|');
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
      entry = fs.readFileSync(directorio + indice + '/' + entrada + '.txt', { encoding: 'utf8' });
    } catch(err){
      console.log('leer entrada indice sync Error', err);
      return null;
    }
    entry = this.parse(entry, indice, entrada);
    return entry;
  }
  last_num(indice){ // SYNC
    let logfile, data;
    let logRoom = indice.replace(/\/$/, '').replace(/\//ig, '.');
    if((/^gritos\//).test(indice)){
      logRoom = logRoom.replace(/gritos\./,'');
      logfile = `/home/gritos/www/admin/logs/${logRoom}.num.txt`;
    } else {
      logfile = `/home/indices/admin/logs/${logRoom}.num.txt`;
    }
    console.log('logfile es ', logfile);
    try{
      data = fs.readFileSync(logfile, { encoding: 'utf8' });
    } catch(err){
      console.log('readcollection Error', err);
      return null;
    }
    data = data.replace(/\n$/,'');
    return Number(data);
  }
}
export default new Indicesdb();
