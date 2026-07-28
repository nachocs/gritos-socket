import * as cheerio from 'cheerio';

// Replaces node-metainspector, which was unmaintained and pulled in the
// deprecated `request` package (plus cheerio 0.19) for what amounts to four
// CSS selectors. Extraction below matches what node-metainspector did, so
// correctorBruto() keeps receiving the same shape of text it always has.

const MINIMUM_P_LENGTH = 120;

// The page is decoded as latin1, exactly as `request` did with
// { encoding: 'latin1' }. Most of the pages being previewed are legacy
// ISO-8859-1, and correctorBruto() downstream is written to repair the
// mojibake this produces on pages that are actually UTF-8. Decoding
// correctly here would silently break every one of those fixups.
const decodeLatin1 = (buffer) => Buffer.from(buffer).toString('latin1');

const absolute = (href, base) => {
  if (!href){ return undefined; }
  try {
    return new URL(href, base).href;
  } catch {
    return undefined;
  }
};

export async function fetchMetadata(url, { timeout = 5000 } = {}){
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
    headers: {
      // node-metainspector sent gzip: true; fetch negotiates encoding itself,
      // but some sites serve a bare 403 without a browser-shaped User-Agent.
      'User-Agent': 'Mozilla/5.0 (compatible; gritos-socket/1.0; +https://gritos.com)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (response.status !== 200){
    throw new Error(`Unexpected status ${response.status} for ${url}`);
  }

  const finalUrl = response.url || url;
  const $ = cheerio.load(decodeLatin1(await response.arrayBuffer()));

  const title = $('head > title').text();

  let description = $("meta[name='description']").attr('content');
  if (!description){
    // Fall back to the first sufficiently long paragraph, as before.
    $('p').each((i, elem) => {
      if (description){ return; }
      const text = $(elem).text();
      if (text.length >= MINIMUM_P_LENGTH){
        description = text;
      }
    });
  }

  const image = absolute($("meta[property='og:image']").attr('content'), finalUrl);
  const images = $('img')
    .map((i, elem) => absolute($(elem).attr('src'), finalUrl))
    .get()
    .filter(Boolean);

  return { url: finalUrl, title, description, image, images };
}
