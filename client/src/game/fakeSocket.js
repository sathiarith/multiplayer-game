import { EventEmitter } from "node:events";
import { vi } from "vitest";

// A stand-in for a socket.io client socket. Tests call emit() to play the server.
export class FakeSocket extends EventEmitter {
  close = vi.fn();
  volatile = { emit: vi.fn() }; // what sendInput uses
}

// A stand-in for the `io` function. Every socket it creates is kept in io.sockets.
export function fakeIo() {
  const sockets = [];
  const io = vi.fn((options) => {
    const socket = new FakeSocket();
    socket.options = options;
    sockets.push(socket);
    return socket;
  });
  io.sockets = sockets;
  return io;
}
