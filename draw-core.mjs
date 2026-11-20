import { createHash, randomInt } from 'node:crypto';

export function nameKey(name) {
  return name.replace(/\p{Default_Ignorable_Code_Point}/gu, '')
    .normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function hash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function shuffleRecipients(names) {
  let recipients;
  // Reject shuffles with a self-match to sample uniformly from valid draws.
  do {
    recipients = [...names];
    for (let i = recipients.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [recipients[i], recipients[j]] = [recipients[j], recipients[i]];
    }
  } while (recipients.some((recipient, i) => recipient === names[i]));
  return recipients;
}

export const schema = `CREATE TABLE IF NOT EXISTS draws (
        invite_hash TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        recipient TEXT NOT NULL UNIQUE CHECK (recipient <> name),
        claim_hash TEXT
      ) STRICT;`;
