export interface Room {
  clients: string[];
}

const MAX_PARTICIPANTS = 2;
const rooms = new Map<string, Room>();

export function joinRoom(
  roomId: string,
  socketId: string
): { success: true; participantCount: number } | { success: false; error: string } {
  let room = rooms.get(roomId);

  if (!room) {
    room = { clients: [] };
    rooms.set(roomId, room);
  }

  // Already in the room (reconnect scenario)
  if (room.clients.includes(socketId)) {
    return { success: true, participantCount: room.clients.length };
  }

  if (room.clients.length >= MAX_PARTICIPANTS) {
    return { success: false, error: "room-full" };
  }

  room.clients.push(socketId);
  return { success: true, participantCount: room.clients.length };
}

export function leaveRoom(socketId: string): { roomId: string; remaining: number }[] {
  const leftRooms: { roomId: string; remaining: number }[] = [];

  for (const [roomId, room] of rooms) {
    const idx = room.clients.indexOf(socketId);
    if (idx !== -1) {
      room.clients.splice(idx, 1);
      console.log(`📤 ${socketId} left room ${roomId} (${room.clients.length} remaining)`);
      leftRooms.push({ roomId, remaining: room.clients.length });

      // Clean up empty rooms
      if (room.clients.length === 0) {
        rooms.delete(roomId);
        console.log(`🗑️  Room ${roomId} deleted (empty)`);
      }
    }
  }

  return leftRooms;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getAllRooms(): Map<string, Room> {
  return rooms;
}
