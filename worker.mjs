import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, nameKey, schema, shuffleRecipients } from './draw-core.mjs';

const token = /^[a-f0-9]{64}$/;
const reply = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const failure = (message, status) => reply({ error: message }, status);

function inviteFor(secret, salt, key) {
  return createHmac('sha256', secret).update(salt + ':' + key).digest('hex');
}

async function setup(db, secret, names, origin) {
  await db.batch([
    db.prepare(schema),
    db.prepare('CREATE TABLE IF NOT EXISTS setup (id INTEGER PRIMARY KEY CHECK(id = 1), salt TEXT NOT NULL)'),
  ]);
  const readSetup = () => db.prepare('SELECT salt FROM setup WHERE id = 1').first();
  let metadata = await readSetup();
  if (!metadata) {
    if (!Array.isArray(names) || names.length < 2 || names.length > 100 ||
        names.some(name => typeof name !== 'string' || name.length > 100 || !nameKey(name))) {
      return failure('Sisesta 2–100 nime, iga nimi eraldi real.', 400);
    }
    names = names.map(name => name.trim().replace(/\s+/g, ' '));
    if (new Set(names.map(nameKey)).size !== names.length) {
      return failure('Igal osalejal peab olema erinev nimi.', 400);
    }
    const salt = randomBytes(32).toString('hex');
    const recipients = shuffleRecipients(names);
    const inserts = [];
    // Keep both bound parameters per statement and D1 calls within the Free plan limits.
    for (let start = 0; start < names.length; start += 20) {
      const group = names.slice(start, start + 20);
      const values = group.flatMap((name, i) => [
        hash(inviteFor(secret, salt, nameKey(name))), name, nameKey(name), recipients[start + i],
      ]);
      const placeholders = group.map(() => '(?,?,?,?)').join(',');
      inserts.push(db.prepare('INSERT INTO draws (invite_hash,name,name_key,recipient) VALUES ' + placeholders).bind(...values));
    }
    try {
      await db.batch([
        db.prepare('INSERT INTO setup (id,salt) VALUES (1,?)').bind(salt),
        ...inserts,
      ]);
      metadata = { salt };
    } catch (error) {
      // A concurrent setup may already have committed the complete draw.
      metadata = await readSetup();
      if (!metadata) throw error;
    }
  }
  const { results } = await db.prepare('SELECT name,name_key,invite_hash FROM draws ORDER BY rowid').all();
  const links = [];
  for (const row of results) {
    const invite = inviteFor(secret, metadata.salt, row.name_key);
    if (hash(invite) !== row.invite_hash) return failure('Linkide taastamiseks kasuta algset korraldaja võtit.', 409);
    links.push({ name: row.name, url: origin + '/#' + invite });
  }
  return reply({ links });
}

async function draw(db, { invite, device, name, check }) {
  if (typeof invite !== 'string' || !token.test(invite) || typeof device !== 'string' || !token.test(device) ||
      (check !== undefined && (check !== true || name === undefined)) ||
      (name !== undefined && (typeof name !== 'string' || name.length > 100 || !nameKey(name)))) {
    return failure('Kontrolli kutse linki ja sisesta oma nimi.', 400);
  }
  const inviteHash = hash(invite);
  const deviceHash = hash(device);
  const lookup = db.prepare('SELECT recipient FROM draws WHERE invite_hash = ? AND claim_hash = ?').bind(inviteHash, deviceHash);
  if (name === undefined) {
    const result = await lookup.first();
    return reply(result ?? {}, result ? 200 : 404);
  }
  const row = await db.prepare('SELECT name_key,claim_hash FROM draws WHERE invite_hash = ?').bind(inviteHash).first();
  if (!row || row.name_key !== nameKey(name)) return failure('Nimi ei klapi kutsega. Kontrolli oma nime ja linki.', 403);
  if (check && row.claim_hash === null) return reply({ ready: true });
  if (!check && row.claim_hash === null) {
    await db.prepare('UPDATE draws SET claim_hash = ? WHERE invite_hash = ? AND claim_hash IS NULL').bind(deviceHash, inviteHash).run();
  }
  const result = await lookup.first();
  return result ? reply(result) : failure('Selle kutsega on juba loositud. Ava link brauseris, kus loosi tõmbasid.', 409);
}

export default {
  async fetch(request, env) {
    const { pathname, origin } = new URL(request.url);
    const organizer = pathname === '/api/setup';
    if (!organizer && pathname !== '/api/draw') return failure('Lehte ei leitud.', 404);
    if (request.method !== 'POST') return failure('Kasuta POST-päringut.', 405);
    if (organizer) {
      if (!env.SETUP_SECRET) return failure('Lisa Cloudflare’is Workerile saladus SETUP_SECRET.', 503);
      const provided = request.headers.get('Authorization') ?? '';
      if (!timingSafeEqual(Buffer.from(hash(provided)), Buffer.from(hash('Bearer ' + env.SETUP_SECRET)))) {
        return failure('Kontrolli korraldaja võtit.', 403);
      }
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request.body ?? []) {
      size += chunk.byteLength;
      if (size > (organizer ? 65536 : 4096)) return failure('Päring on liiga suur.', 413);
      chunks.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { return failure('Vigane päring.', 400); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return failure('Vigane päring.', 400);
    try {
      return organizer ? await setup(env.DB, env.SETUP_SECRET, data.names, origin) : await draw(env.DB, data);
    } catch {
      return failure('Loos pole praegu saadaval. Proovi hetke pärast uuesti.', 503);
    }
  },
};
