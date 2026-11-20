const form = document.querySelector('form');
const status = document.querySelector('#status');
const links = document.querySelector('#links');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  links.replaceChildren();
  status.textContent = 'Avan kutseid…';
  try {
    const response = await fetch('/api/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + document.querySelector('#secret').value,
      },
      body: JSON.stringify({ names: document.querySelector('#names').value.split('\n').map(n => n.trim()).filter(Boolean) }),
    });
    const result = await response.json();
    if (!response.ok) {
      status.textContent = result.error;
      return;
    }
    form.reset();
    status.textContent = 'Kopeeri iga osaleja link ja saada see talle privaatselt.';
    for (const invite of result.links) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = invite.url;
      link.textContent = invite.name;
      item.append(link);
      links.append(item);
    }
  } catch {
    status.textContent = 'Ühendus katkes. Proovi uuesti sama võtmega.';
  } finally {
    button.disabled = false;
  }
});
