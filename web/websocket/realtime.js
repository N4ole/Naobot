/**
 * Canal temps réel de l'interface web via **SSE (Server-Sent Events)** —
 * équivalent WebSocket sans dépendance externe, adapté à un flux
 * serveur → navigateur (mises à jour du tableau de bord, journal en direct).
 *
 * Le hub conserve les connexions ouvertes et diffuse les événements à tous les
 * clients. Un battement régulier (heartbeat) maintient les connexions vivantes.
 */
const clients = new Set();

function headers() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

/** Enregistre une réponse HTTP comme flux SSE. */
function addClient(res) {
  res.writeHead(200, headers());
  res.write('retry: 5000\n\n');
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

function format(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Diffuse un événement à tous les clients connectés. */
function broadcast(event, data) {
  const payload = format(event, data);
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function heartbeat() {
  for (const res of clients) {
    try {
      res.write(': ping\n\n');
    } catch {
      clients.delete(res);
    }
  }
}

function start({ onTick, intervalMs = 5000 } = {}) {
  const timer = setInterval(() => {
    heartbeat();
    if (onTick) {
      try {
        onTick(broadcast);
      } catch {
        /* une erreur de tick ne doit pas arrêter le hub */
      }
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

function clientCount() {
  return clients.size;
}

module.exports = { addClient, broadcast, start, heartbeat, clientCount };
