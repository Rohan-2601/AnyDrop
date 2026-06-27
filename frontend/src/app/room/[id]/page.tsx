"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { useWebRTC, type RTCState } from "@/lib/useWebRTC";
import type { Socket } from "socket.io-client";

type RoomState = "connecting" | "waiting" | "ready" | "room-full" | "error";

export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const [roomState, setRoomState] = useState<RoomState>("connecting");
  const [peerReady, setPeerReady] = useState(false);
  const [receivedMessage, setReceivedMessage] = useState<string | null>(null);
  const socketRef = useRef<Socket>(getSocket());

  // The joiner is never the initiator — the host (homepage) always initiates
  const { rtcState, sendMessage } = useWebRTC({
    socket: socketRef.current,
    roomId,
    isInitiator: false,
    peerReady,
    onMessage: (msg) => setReceivedMessage(msg),
  });

  useEffect(() => {
    if (rtcState === "connected") {
      // Send a reply back if needed, but for now we just receive
      // sendMessage("hello from phone");
    }
  }, [rtcState, sendMessage]);

  useEffect(() => {
    const socket = socketRef.current;

    const handleConnect = () => {
      socket.emit(
        "join-room",
        roomId,
        (res: { success: boolean; participantCount?: number; error?: string }) => {
          if (!res.success) {
            setRoomState(res.error === "room-full" ? "room-full" : "error");
            return;
          }
          if (res.participantCount! >= 2) {
            setRoomState("ready");
            setPeerReady(true);
          } else {
            setRoomState("waiting");
          }
        }
      );
    };

    socket.on("connect", handleConnect);

    socket.on("peer-joined", (data: { participantCount: number }) => {
      if (data.participantCount >= 2) {
        setRoomState("ready");
        setPeerReady(true);
      }
    });

    socket.on("peer-left", (data: { participantCount: number }) => {
      if (data.participantCount < 2) {
        setRoomState("waiting");
        setPeerReady(false);
      }
    });

    socket.on("connect_error", () => setRoomState("error"));

    socket.connect();
    if (socket.connected) handleConnect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("peer-joined");
      socket.off("peer-left");
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [roomId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 font-sans text-white">
      <main className="flex flex-col items-center gap-8 text-center">
        {/* Logo */}
        <h1 className="text-4xl font-bold tracking-tight">
          Any<span className="text-indigo-400">Drop</span>
        </h1>

        {/* Room ID */}
        <div className="flex items-center gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/60 px-5 py-3">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Room
          </span>
          <span className="font-mono text-xl font-bold tracking-[0.25em] text-indigo-400">
            {roomId}
          </span>
        </div>

        {/* Status Card */}
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900/70 px-12 py-8">
          <StatusIndicator roomState={roomState} rtcState={rtcState} receivedMessage={receivedMessage} />
        </div>
      </main>
    </div>
  );
}

function StatusIndicator({ roomState, rtcState, receivedMessage }: { roomState: RoomState; rtcState: RTCState; receivedMessage: string | null }) {
  // Connection errors and room-full take priority
  if (roomState === "room-full") {
    return (
      <>
        <StatusIcon type="error" />
        <p className="text-lg font-semibold text-red-400">Room Full</p>
        <p className="text-xs text-zinc-500">This room already has 2 participants</p>
      </>
    );
  }

  if (roomState === "error") {
    return (
      <>
        <StatusIcon type="warning" />
        <p className="text-lg font-semibold text-red-400">Connection Failed</p>
        <p className="text-xs text-zinc-500">Could not connect to the server</p>
      </>
    );
  }

  if (roomState === "connecting") {
    return (
      <>
        <Spinner />
        <p className="text-sm text-zinc-400">Connecting to server…</p>
      </>
    );
  }

  if (roomState === "waiting") {
    return (
      <>
        <div className="flex items-center justify-center">
          <span className="h-3 w-3 animate-pulse rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
        </div>
        <p className="text-base font-medium text-zinc-300">Waiting for peer…</p>
        <p className="text-xs text-zinc-500">Share the room link or scan the QR code</p>
      </>
    );
  }

  // roomState === "ready" — show WebRTC state
  if (rtcState === "connected") {
    return (
      <>
        <StatusIcon type="success" />
        <p className="text-lg font-semibold text-emerald-400">Connected ✓</p>
        <p className="text-xs text-zinc-500">Peer connection established</p>
        {receivedMessage && (
          <div className="mt-2 rounded bg-zinc-800/60 px-4 py-2">
            <p className="text-sm text-zinc-300">Received: {receivedMessage}</p>
          </div>
        )}
      </>
    );
  }

  if (rtcState === "failed") {
    return (
      <>
        <StatusIcon type="error" />
        <p className="text-lg font-semibold text-red-400">Peer Connection Failed</p>
        <p className="text-xs text-zinc-500">Could not establish a direct connection</p>
      </>
    );
  }

  return (
    <>
      <Spinner />
      <p className="text-sm text-zinc-400">Establishing peer connection…</p>
    </>
  );
}

function StatusIcon({ type }: { type: "success" | "error" | "warning" }) {
  const colors = {
    success: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
    error: { bg: "bg-red-500/10", text: "text-red-400" },
    warning: { bg: "bg-red-500/10", text: "text-red-400" },
  };
  const paths = {
    success: "M4.5 12.75l6 6 9-13.5",
    error: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
    warning: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  };

  return (
    <div className={`flex h-12 w-12 items-center justify-center rounded-full ${colors[type].bg}`}>
      <svg className={`h-6 w-6 ${colors[type].text}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d={paths[type]} />
      </svg>
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
  );
}
