import { startScratch } from './scratch.js';

const invite = location.hash.slice(1);
const form = document.querySelector('#draw-form');
const nameInput = document.querySelector('#name');
const continueButton = form.querySelector('button');
const notice = document.querySelector('#notice');
const pickHint = document.querySelector('#pick-hint');
const scratchControls = document.querySelector('#scratch-controls');
const scratchHint = document.querySelector('#scratch-hint');
const showRecipient = document.querySelector('#show-recipient');
const doneHint = document.querySelector('#done-hint');
const feedback = document.querySelector('#feedback');
const stage = document.querySelector('#stage');
const deck = document.querySelector('#deck');
const tickets = Array.from(deck.querySelectorAll('button'));
const assignment = document.querySelector('#assignment');
const recipientHeading = document.querySelector('#recipient');
const foil = document.querySelector('#foil');
const storageKey = `secret-santa:${invite}`;
const revealedKey = `${storageKey}:revealed`;
const networkError = 'Ühendus loosiga katkes. Proovi hetke pärast uuesti.';

function readSaved(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadOrCreateDevice() {
  const saved = readSaved(storageKey);
  if (saved) return saved;

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const device = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(storageKey, device);
  } catch {
    doneHint.textContent = 'Jäta nimi enne lehe sulgemist meelde ja hoia seda saladuses.';
  }
  return device;
}

function requestDraw(device, name, check) {
  return fetch('/api/draw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite, device, name, check }),
  });
}

function setState(state) {
  stage.dataset.state = state;
  const scratch = state === 'scratch';
  notice.hidden = state !== 'locked';
  form.hidden = state !== 'identify';
  pickHint.hidden = state !== 'pick';
  scratchControls.hidden = !scratch;
  doneHint.hidden = state !== 'result';
  deck.hidden = scratch || state === 'result';
  deck.setAttribute('aria-hidden', String(state !== 'pick'));
  assignment.hidden = !deck.hidden;
  recipientHeading.setAttribute('aria-hidden', String(scratch));
  foil.hidden = !scratch;
  tickets.forEach((ticket) => { ticket.disabled = state !== 'pick'; });
}

function reveal() {
  try {
    localStorage.setItem(revealedKey, 'yes');
  } catch {
    // The result still opens when browser storage is unavailable.
  }
  setState('result');
  recipientHeading.focus();
}

function openTicket(recipient, pickedTicket) {
  if (pickedTicket) {
    assignment.dataset.from = pickedTicket.dataset.pick;
    assignment.querySelector('.result-stamp').textContent = pickedTicket.querySelector('.ticket-stamp').textContent;
  }
  recipientHeading.textContent = recipient;
  nameInput.value = '';
  if (readSaved(revealedKey)) {
    reveal();
    return;
  }
  setState('scratch');
  showRecipient.onclick = startScratch(foil, reveal);
  scratchHint.focus();
}

async function openInvitation() {
  let device = readSaved(storageKey);
  let verifiedName;
  if (device) {
    notice.textContent = 'Avan sinu kutset…';
    try {
      const response = await requestDraw(device);
      if (response.ok) {
        openTicket((await response.json()).recipient);
        return;
      }
    } catch {
      // A retry uses the same browser key.
    }
  }

  setState('identify');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      feedback.textContent = 'Sisesta oma nimi.';
      nameInput.focus();
      return;
    }

    continueButton.disabled = true;
    continueButton.textContent = 'Kontrollin…';
    feedback.textContent = '';
    try {
      if (!device) {
        device = navigator.locks
          ? await navigator.locks.request(storageKey, loadOrCreateDevice)
          : loadOrCreateDevice();
      }
      const response = await requestDraw(device, name, true);
      const result = await response.json();
      if (!response.ok) {
        feedback.textContent = result.error;
        nameInput.focus();
        return;
      }
      if (result.recipient) {
        openTicket(result.recipient);
        return;
      }
      verifiedName = name;
      setState('pick');
      tickets[0].focus();
    } catch {
      feedback.textContent = networkError;
    } finally {
      continueButton.disabled = false;
      continueButton.textContent = 'Jätka';
    }
  });

  for (const ticket of tickets) {
    ticket.addEventListener('click', async () => {
      tickets.forEach((choice) => { choice.disabled = true; });
      deck.dataset.pending = ticket.dataset.pick;
      feedback.textContent = '';
      try {
        const response = await requestDraw(device, verifiedName);
        const result = await response.json();
        if (!response.ok) {
          feedback.textContent = result.error;
          return;
        }
        openTicket(result.recipient, ticket);
      } catch {
        feedback.textContent = networkError;
      } finally {
        delete deck.dataset.pending;
        if (stage.dataset.state === 'pick') {
          tickets.forEach((choice) => { choice.disabled = false; });
          ticket.focus();
        }
      }
    });
  }
}

window.addEventListener('hashchange', () => {
  setState('locked');
  location.reload();
});

if (/^[a-f0-9]{64}$/.test(invite)) openInvitation();
