import { randomBytes } from 'node:crypto';
import { nameKey, hash, shuffleRecipients, schema } from './draw-core.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.env.DRAW_DB || new URL('./draw.sqlite', import.meta.url);
const tokenPattern = /^[a-f0-9]{64}$/;

function checkAssignments(draws) {
  const names = new Set(draws.map(({ name }) => nameKey(name)));
  const recipients = new Set(draws.map(({ recipient }) => nameKey(recipient)));
  if (draws.length < 2 || names.has('') || names.size !== draws.length || recipients.size !== draws.length
    || draws.some(({ name, recipient }) => nameKey(name) === nameKey(recipient) || !names.has(nameKey(recipient)))) {
    throw new Error('Loosifailis on vigased paarid. Kasuta uue loosi jaoks eraldi DRAW_DB faili.');
  }
}

function setup(siteUrl, inputNames) {
  const base = URL.parse(siteUrl ?? '');
  if (!base || !['http:', 'https:'].includes(base.protocol) || base.href !== `${base.origin}/`) {
    throw new Error('Sisesta loosi veebiaadress, näiteks http://localhost:3000.');
  }

  const names = inputNames.map((name) => name.trim().replace(/\s+/g, ' '));
  if (names.length < 2 || names.some((name) => !nameKey(name) || name.length > 100)) {
    throw new Error('Sisesta vähemalt kaks nime. Iga nimi võib olla kuni 100 tähemärki pikk.');
  }
  if (new Set(names.map(nameKey)).size !== names.length) {
    throw new Error('Igal osalejal peab olema erinev nimi. Vajadusel lisa perekonnanime esitäht.');
  }

  const recipients = shuffleRecipients(names);
  const invites = names.map(() => randomBytes(32).toString('hex'));
  const db = new DatabaseSync(databasePath, { timeout: 5000 });
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${schema}
    `);
    if (db.prepare('SELECT 1 FROM draws LIMIT 1').get()) {
      throw new Error('See loos on juba loodud. Kasuta uue loosi jaoks eraldi DRAW_DB faili.');
    }

    const insert = db.prepare('INSERT INTO draws (invite_hash, name, name_key, recipient) VALUES (?, ?, ?, ?)');
    names.forEach((name, i) => insert.run(hash(invites[i]), name, nameKey(name), recipients[i]));
    db.exec('COMMIT');
  } finally {
    db.close();
  }

  console.log('Salvesta lingid ja saada iga link privaatselt õigele osalejale.');
  names.forEach((name, i) => console.log(`${name}\t${base.href}#${invites[i]}`));
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function readDrawRequest(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) return null;
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function serve() {
  if (!existsSync(databasePath)) {
    throw new Error('Loo esmalt loos käsuga node server.mjs setup <aadress> <nimi> <nimi> [...].');
  }

  const db = new DatabaseSync(databasePath, { timeout: 5000 });
  checkAssignments(db.prepare('SELECT name, recipient FROM draws').all());
  const readResult = db.prepare('SELECT recipient FROM draws WHERE invite_hash = ? AND claim_hash = ?');
  const findInvite = db.prepare('SELECT name, claim_hash FROM draws WHERE invite_hash = ?');
  const claim = db.prepare(`
    UPDATE draws SET claim_hash = ?
    WHERE invite_hash = ? AND claim_hash IS NULL
    RETURNING recipient
  `);

  const assets = new Map([
    ['/', ['index.html', 'text/html']],
    ['/style.css', ['style.css', 'text/css']],
    ['/draw.js', ['draw.js', 'text/javascript']],
    ['/scratch.js', ['scratch.js', 'text/javascript']],
  ].map(([route, [file, mime]]) => [route, {
    body: readFileSync(new URL(`./public/${file}`, import.meta.url)),
    type: `${mime}; charset=utf-8`,
  }]));

  async function draw(request, response) {
    const data = await readDrawRequest(request);
    const { invite, device, name, check } = data ?? {};
    if (typeof invite !== 'string' || !tokenPattern.test(invite)
      || typeof device !== 'string' || !tokenPattern.test(device)
      || (check !== undefined && (check !== true || name === undefined))
      || (name !== undefined && (typeof name !== 'string' || !nameKey(name) || name.length > 100))) {
      return sendJson(response, 400, { error: 'Kontrolli kutse linki ja sisesta oma nimi.' });
    }

    const inviteHash = hash(invite);
    const deviceHash = hash(device);
    if (name === undefined) {
      const result = readResult.get(inviteHash, deviceHash);
      return sendJson(response, result ? 200 : 404, result ?? {});
    }

    const invitation = findInvite.get(inviteHash);
    if (!invitation || nameKey(invitation.name) !== nameKey(name)) {
      return sendJson(response, 403, { error: 'Nimi ei klapi kutsega. Kontrolli nime kirjapilti või küsi korraldajalt oma linki.' });
    }

    if (check && invitation.claim_hash === null) {
      return sendJson(response, 200, { ready: true });
    }
    const result = (check ? undefined : claim.get(deviceHash, inviteHash)) ?? readResult.get(inviteHash, deviceHash);
    if (result) return sendJson(response, 200, result);
    return sendJson(response, 409, { error: 'Selle kutsega on juba loositud. Ava link brauseris, kus loosi tõmbasid.' });
  }

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");

    const path = request.url.split('?')[0];
    const asset = assets.get(path);
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset.type });
      return response.end(asset.body);
    }

    try {
      if (request.method === 'POST' && path === '/api/draw') return await draw(request, response);
      sendJson(response, 404, { error: 'Lehte ei leitud.' });
    } catch (error) {
      console.error('Loosimine ebaõnnestus.', error.message);
      sendJson(response, 500, { error: 'Loosimine ebaõnnestus. Proovi hetke pärast uuesti.' });
    }
  });

  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  server.listen(port, host, () => {
    console.log(`Jõulu loos töötab aadressil http://${host}:${server.address().port}`);
  });
}

try {
  const [command, siteUrl, ...names] = process.argv.slice(2);
  if (command === 'setup') setup(siteUrl, names);
  else if (command === undefined) serve();
  else throw new Error('Käivita loos käsuga node server.mjs või loo loos käsuga node server.mjs setup <aadress> <nimed...>.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
