const rooms = new Map();

function roomKey(collegeId, catalogCourseId) {
  return `${Number(collegeId)}:${Number(catalogCourseId)}`;
}

export function subscribeCourseChat(collegeId, catalogCourseId, res) {
  const key = roomKey(collegeId, catalogCourseId);
  const clients = rooms.get(key) || new Set();
  clients.add(res);
  rooms.set(key, clients);

  const drop = () => {
    const current = rooms.get(key);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) rooms.delete(key);
  };
  res.on('close', drop);
  res.on('finish', drop);
}

export function publishCourseChat(collegeId, catalogCourseId, payload) {
  const clients = rooms.get(roomKey(collegeId, catalogCourseId));
  if (!clients?.size) return 0;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
  return clients.size;
}

export function openCourseChatStream(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(': connected\n\n');
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(ping);
    }
  }, 20000);
  res.on('close', () => clearInterval(ping));
  res.on('finish', () => clearInterval(ping));
}
