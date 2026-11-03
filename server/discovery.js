// UDP broadcast discovery: nodes find each other on the school LAN with
// zero configuration, even when the internet is completely down.
import dgram from 'node:dgram';

const MAGIC = 'mz-discovery-v1';

export function startDiscovery({ nodeId, port, onPeer }) {
  const discoPort = Number(process.env.MZ_DISCOVERY_PORT || 47820);
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const known = new Map(); // addr:port -> lastSeen

  sock.on('error', err => {
    console.warn('discovery error:', err.message, '(LAN auto-discovery unavailable; manual peers still work)');
  });

  sock.on('message', (msg, rinfo) => {
    let data;
    try { data = JSON.parse(msg.toString()); } catch { return; }
    if (!data || data.t !== MAGIC || data.id === nodeId) return;
    const key = `${rinfo.address}:${data.port}`;
    if (!known.has(key)) {
      console.log('discovered peer', key, `(${data.name || 'node'})`);
    }
    known.set(key, Date.now());
    onPeer({ addr: rinfo.address, port: Number(data.port), nodeId: data.id, name: data.name });
  });

  try {
    sock.bind(discoPort, () => {
      try { sock.setBroadcast(true); } catch {}
      const payload = Buffer.from(JSON.stringify({ t: MAGIC, id: nodeId, port, name: process.env.MZ_NODE_NAME || 'school-node' }));
      const timer = setInterval(() => {
        for (const [key, ts] of known) if (Date.now() - ts > 30_000) known.delete(key);
        try { sock.send(payload, discoPort, '255.255.255.255'); } catch {}
        try { sock.send(payload, discoPort, '127.0.0.1'); } catch {}
      }, 3000);
      timer.unref();
      // Initial burst so new nodes appear fast.
      try { sock.send(payload, discoPort, '255.255.255.255'); } catch {}
      console.log(`LAN discovery listening on UDP ${discoPort}`);
    });
  } catch (err) {
    console.warn('discovery bind failed:', err.message);
  }

  return { close: () => { try { sock.close(); } catch {} } };
}
