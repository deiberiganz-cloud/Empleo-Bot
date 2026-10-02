const test = require('node:test');
const assert = require('node:assert');
const { bajarFuentes, leerRss, decodificar, arreglarAcentos } = require('./buscar');

// Con la misma forma que el RSS real de We Work Remotely (datos inventados).
const RSS = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Empresa Uno: Soporte al cliente</title>
  <link>https://weworkremotely.com/remote-jobs/uno</link>
  <description>&lt;p&gt;Atención al cliente en español &amp;amp; LATAM&lt;/p&gt;</description>
  <pubDate>Wed, 01 Oct 2026 10:00:00 +0000</pubDate>
</item>
<item>
  <title><![CDATA[Empresa Dos: QA Tester]]></title>
  <link>https://weworkremotely.com/remote-jobs/dos</link>
  <description><![CDATA[<p>Testing manual</p>]]></description>
  <pubDate>fecha rota</pubDate>
</item>
</channel></rss>`;

test('leerRss devuelve los mismos campos que el nodo de n8n, con el HTML ya decodificado', () => {
  const items = leerRss(RSS);
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(items[0], {
    title: 'Empresa Uno: Soporte al cliente',
    link: 'https://weworkremotely.com/remote-jobs/uno',
    content: '<p>Atención al cliente en español &amp; LATAM</p>',
    isoDate: '2026-10-01T10:00:00.000Z',
  });
  assert.strictEqual(items[1].title, 'Empresa Dos: QA Tester');
  assert.strictEqual(items[1].content, '<p>Testing manual</p>');
  // Una fecha que no se entiende queda vacía en vez de romper la búsqueda.
  assert.strictEqual(items[1].isoDate, '');
});

test('decodificar no decodifica dos veces', () => {
  assert.strictEqual(decodificar('&amp;lt;b&amp;gt; &#241;'), '&lt;b&gt; ñ');
});

test('si una fuente falla, las demás siguen y el error queda anotado', async () => {
  const { items, errores, respondieron } = await bajarFuentes([
    { nombre: 'Portal lista', bajar: async () => [{ a: 1 }, { a: 2 }] },
    { nombre: 'Portal caído', bajar: async () => { throw new Error('respondió 503'); } },
    { nombre: 'Portal objeto', bajar: async () => ({ jobs: [] }) },
  ]);
  assert.deepStrictEqual(items, [{ json: { a: 1 } }, { json: { a: 2 } }, { json: { jobs: [] } }]);
  assert.deepStrictEqual(errores, ['Portal caído: respondió 503']);
  assert.strictEqual(respondieron, 2);
});

test('arreglarAcentos repara el texto doble codificado de RemoteOK y no toca el que está bien', () => {
  const roto = text => Buffer.from(text, 'utf8').toString('latin1');
  assert.strictEqual(arreglarAcentos(roto('tecnológico en LATAM – Python')), 'tecnológico en LATAM – Python');
  assert.strictEqual(arreglarAcentos('tecnolÃ³gico'), 'tecnológico');
  assert.strictEqual(arreglarAcentos('Atención al cliente – remoto'), 'Atención al cliente – remoto');
  assert.strictEqual(arreglarAcentos(undefined), undefined);
});
