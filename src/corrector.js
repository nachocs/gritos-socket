// Extracted verbatim from the App class so it can be tested without booting
// the server (which reads production TLS certs at module load).
//
// This repairs mojibake: pages are fetched and decoded as latin1, so a page
// that is actually UTF-8 arrives with its multi-byte sequences split into
// individual latin1 characters ("Ã³" for "ó"). Each replace below maps one
// such sequence back to an HTML entity. The trailing steps strip any
// remaining non-ASCII, so a missing rule degrades to a dropped character
// rather than garbage. Do not "simplify" these regexes.
export function correctorBruto(string){
  if (!string){return string;}
  string = string.replace(/Ã"/ig, '&Oacute;');
  string = string.replace(/Ã‰/ig, '&Eacute;');
  string = string.replace(/Ãš/ig, '&Uacute;');
  string = string.replace(/Â¿/ig, '&iquest;');
  string = string.replace(/Ã³/ig, '&oacute;');
  string = string.replace(/Ãº/ig, '&uacute;');
  string = string.replace(/Ã¡/ig, '&aacute;');
  string = string.replace(/Ã²/ig, '&ograve;');
  string = string.replace(/Ã¼/ig, '&uuml;');
  string = string.replace(/Ã©/ig, '&eacute;');
  string = string.replace(/Ã¤/ig, '&auml;');
  string = string.replace(/Ã /ig, '&agrave;');
  string = string.replace(/Ã±/ig, '&ntilde;');
  string = string.replace(/Ã«/ig, '&euml;');
  string = string.replace(/Ã'/ig, '&Ntilde;');
  string = string.replace(/â€™/ig, '&acute;');
  string = string.replace(/â€"/ig, '-');
  string = string.replace(/â€œ/ig, '&quot;');
  string = string.replace(/â€¢/ig, '&middot;');
  string = string.replace(/â€¦/ig, '&tdot;');
  string = string.replace(/Ä„/ig, '&iexcl;');
  string = string.replace(/Ã/ig, '&iacute;');
  string = string.replace(/Â/ig, '');
  string = string.replace(/'+/ig, '&apos;');
  string = string.replace(/^\n/ig, '');
  string = string.replace(/<(?:.|\n)*?>/gm, ''); // remove html tags
  string = string.replace(/\n/ig, '<br>');
  // eslint-disable-next-line no-control-regex
  string = string.replace(/[^\x00-\x7F]/g, ''); // remove non-ascii
  string = string.substring(0, 300);
  return string;
}
