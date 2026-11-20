const brushRadius = 48;
const columns = 30;
const rows = 10;
const revealAt = Math.ceil(columns * rows * 0.52);

function paintFoil(context, width, height) {
  context.fillStyle = '#d7cfbb';
  context.fillRect(0, 0, width, height);

  for (let x = -height; x < width; x += 9) {
    context.beginPath();
    context.moveTo(x, height);
    context.lineTo(x + height, 0);
    context.strokeStyle = x % 2 === 0 ? '#e4ddca' : '#c8bfaa';
    context.stroke();
  }

  context.strokeStyle = '#a69a81';
  context.setLineDash([5, 5]);
  context.strokeRect(14, 14, width - 28, height - 28);
  context.setLineDash([]);
  context.fillStyle = '#463d30';
  context.font = '650 38px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('Kraabi siit', width / 2, height / 2);
}

export function startScratch(canvas, onReveal) {
  const context = canvas.getContext('2d');
  if (!context) {
    onReveal();
    return null;
  }

  const { width, height } = canvas;
  const events = new AbortController();
  const options = { signal: events.signal };
  const cleared = new Uint8Array(columns * rows);
  let clearedCount = 0;
  let pointer = null;
  let lastPoint;

  paintFoil(context, width, height);
  context.globalCompositeOperation = 'destination-out';
  context.lineWidth = brushRadius * 2;
  context.lineCap = 'round';

  function finish() {
    if (events.signal.aborted) return;
    events.abort();
    onReveal();
  }

  function pointAt(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * width / bounds.width,
      y: (event.clientY - bounds.top) * height / bounds.height,
    };
  }

  function erase(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    context.beginPath();
    if (lengthSquared) {
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    } else {
      context.arc(to.x, to.y, brushRadius, 0, 2 * Math.PI);
      context.fill();
    }

    // Sample the scratch area without reading canvas pixels on every pointer move.
    for (let i = 0; i < cleared.length; i++) {
      if (cleared[i]) continue;
      const x = ((i % columns + 0.5) * width / columns) - from.x;
      const y = ((Math.floor(i / columns) + 0.5) * height / rows) - from.y;
      const along = lengthSquared ? Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared)) : 0;
      const offsetX = x - along * dx;
      const offsetY = y - along * dy;
      if (offsetX * offsetX + offsetY * offsetY <= brushRadius * brushRadius) {
        cleared[i] = 1;
        clearedCount++;
      }
    }
    if (clearedCount >= revealAt) finish();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (pointer !== null || event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    lastPoint = pointAt(event);
    erase(lastPoint, lastPoint);
  }, options);

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    const point = pointAt(event);
    erase(lastPoint, point);
    lastPoint = point;
  }, options);

  canvas.addEventListener('lostpointercapture', (event) => {
    if (event.pointerId === pointer) pointer = null;
  }, options);

  return finish;
}
