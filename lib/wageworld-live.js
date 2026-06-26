const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const CHAT_RADIUS = 18;
const VOICE_RADIUS = 14;

function distance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dz);
}

function safeName(value) {
  const name = String(value || '').trim().slice(0, 28);
  return name || 'Guest';
}

function send(client, payload) {
  if (client.ws.readyState !== client.ws.OPEN) return;
  client.ws.send(JSON.stringify(payload));
}

function nearbyClients(clients, client, radius) {
  return Array.from(clients.values()).filter((other) => (
    other.id !== client.id &&
    other.map === client.map &&
    distance(other.position, client.position) <= radius
  ));
}

function initWageWorldLive(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/wageworld-live' });
  const clients = new Map();

  function broadcastPresence() {
    clients.forEach((client) => {
      const peers = nearbyClients(clients, client, VOICE_RADIUS).map((peer) => ({
        id: peer.id,
        name: peer.name,
        distance: Math.round(distance(peer.position, client.position) * 10) / 10,
      }));
      send(client, { type: 'nearby', peers, voiceRadius: VOICE_RADIUS, chatRadius: CHAT_RADIUS });
    });
  }

  wss.on('connection', (ws, req) => {
    const client = {
      id: crypto.randomUUID(),
      ws,
      name: 'Guest',
      map: 'Spawn House',
      position: { x: 0, z: 0 },
      isVoiceEnabled: false,
      ip: req.socket.remoteAddress,
    };
    clients.set(client.id, client);
    send(client, { type: 'welcome', id: client.id, chatRadius: CHAT_RADIUS, voiceRadius: VOICE_RADIUS });
    broadcastPresence();

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }

      if (message.type === 'presence') {
        client.name = safeName(message.name);
        client.map = String(message.map || 'Spawn House').slice(0, 64);
        client.position = {
          x: Number.isFinite(message.x) ? message.x : 0,
          z: Number.isFinite(message.z) ? message.z : 0,
        };
        client.isVoiceEnabled = !!message.voice;
        broadcastPresence();
        return;
      }

      if (message.type === 'chat') {
        const text = String(message.text || '').trim().slice(0, 240);
        if (!text) return;
        const payload = {
          type: 'chat',
          id: crypto.randomUUID(),
          from: client.id,
          name: client.name,
          text,
          sentAt: Date.now(),
        };
        send(client, { ...payload, self: true });
        nearbyClients(clients, client, CHAT_RADIUS).forEach((peer) => send(peer, payload));
        return;
      }

      if (['voice-offer', 'voice-answer', 'voice-ice'].includes(message.type)) {
        const target = clients.get(message.to);
        if (!target || target.map !== client.map) return;
        if (distance(target.position, client.position) > VOICE_RADIUS) return;
        send(target, {
          type: message.type,
          from: client.id,
          name: client.name,
          data: message.data,
        });
      }
    });

    ws.on('close', () => {
      clients.delete(client.id);
      clients.forEach((peer) => send(peer, { type: 'peer-left', id: client.id }));
      broadcastPresence();
    });
  });

  console.log('[WageWorld] live WebSocket server ready at /wageworld-live');
  return wss;
}

module.exports = { initWageWorldLive };
