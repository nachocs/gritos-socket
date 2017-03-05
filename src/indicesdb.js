import fs from 'fs';
import iconv from 'iconv-lite';

const directorio = '/home/dreamers/datos/indices/';
const db_delim = '|';

// RECUERDA QUE ESTAS RUTIINAS NO SUBINDEXAN

class Indicesdb{
  leer_entrada_indice(entrada, indice, callback){
    fs.readFile(directorio + indice + '/' + entrada + '.txt', { encoding: 'utf-8' }, (entryErr, entryData) => {
      if (entryErr){
        console.log('Error leer entrada indice', entrada, indice);
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
      const input = fs.readFileSync(directorio + indice + '/' + entrada + '.txt', { encoding: 'binary' });
      entry = iconv.decode(input, 'ISO-8859-1');

    } catch(err){
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
      fs.writeFileSync(directorio + indice + '/' + entrada + '.txt', fichero, { encoding: 'utf-8' });
    } catch(err){
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
    } catch(err){
      console.log('Error last_num', indice);
      return null;
    }
    data = data.replace(/\n$/,'');
    return Number(data);
  }
}
export default new Indicesdb();
