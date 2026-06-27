"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { customAlphabet } from "nanoid";
import { QRCodeSVG } from "qrcode.react";
import { getSocket } from "@/lib/socket";
import { useWebRTC } from "@/lib/useWebRTC";
import { useConnectionState, type ConnectionState } from "@/lib/useConnectionState";
import { useFileTransfer } from "@/lib/useFileTransfer";
import { FileTransferUI } from "@/components/FileTransferUI";
import type { Socket } from "socket.io-client";

const generateRoomId = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peerReady, setPeerReady] = useState(false);
  const socketRef = useRef<Socket>(getSocket());

  const roomId = useMemo(() => generateRoomId(), []);
  
  const roomUrl = mounted 
    ? `${window.location.origin}/room/${roomId}`
    : `http://localhost:3000/room/${roomId}`;

  // We need sendData before we can create useFileTransfer, but we need onMessage for useWebRTC.
  // We can use a ref for handleReceiveData to break the cyclic dependency if needed, 
  // or just declare useFileTransfer after and pass it.
  // But useWebRTC returns sendData, so we can't pass useFileTransfer's handleReceiveData directly.
  // Let's use a ref.
  const handleReceiveDataRef = useRef<((data: string | ArrayBuffer) => void) | null>(null);

  // Always the initiator (host creates the room)
  const { rtcState, isDataChannelOpen, sendData } = useWebRTC({
    socket: socketRef.current,
    roomId,
    isInitiator: true,
    peerReady,
    onMessage: (data) => handleReceiveDataRef.current?.(data),
  });

  const { handleReceiveData, handleSendFile, downloadUrl, error, progress } = useFileTransfer(sendData);
  handleReceiveDataRef.current = handleReceiveData;

  const connectionState = useConnectionState({ peerReady, rtcState, isDataChannelOpen });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const socket = socketRef.current;

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit(
        "join-room",
        roomId,
        (res: { success: boolean; participantCount?: number }) => {
          if (res.success && res.participantCount! >= 2) {
            setPeerReady(true);
          }
        }
      );
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", () => {
      setIsConnected(false);
      setPeerReady(false);
    });

    socket.on("peer-joined", (data: { participantCount: number }) => {
      if (data.participantCount >= 2) setPeerReady(true);
    });

    socket.on("peer-left", (data: { participantCount: number }) => {
      if (data.participantCount < 2) setPeerReady(false);
    });

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect");
      socket.off("peer-joined");
      socket.off("peer-left");
      socket.disconnect();
    };
  }, [roomId]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 font-sans text-white">
        {/* Placeholder while mounting */}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 font-sans text-white">
      <main className="flex flex-col items-center gap-10 text-center">
        {/* Logo */}
        <div>
          <h1 className="text-5xl font-bold tracking-tight">
            Any<span className="text-indigo-400">Drop</span>
          </h1>
          <p className="mt-3 text-base text-zinc-500">
            Peer-to-peer file transfer. Fast, private, no upload.
          </p>
        </div>

        {/* QR Card */}
        <div className="relative flex flex-col items-center gap-6 rounded-2xl border border-zinc-800/60 bg-zinc-900/70 px-10 py-8 shadow-[0_0_48px_rgba(99,102,241,0.06)] backdrop-blur-sm">
          {/* QR Code */}
          <div className="rounded-xl bg-white p-4">
            <QRCodeSVG
              value={roomUrl}
              size={192}
              bgColor="#ffffff"
              fgColor="#09090b"
              level="M"
            />
          </div>

          {/* Scan label */}
          <p className="text-sm font-medium tracking-wide text-zinc-400">
            Scan to join this room
          </p>

          {/* Room ID */}
          <div className="flex items-center gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/60 px-5 py-3">
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Room
            </span>
            <span className="font-mono text-2xl font-bold tracking-[0.25em] text-indigo-400">
              {roomId}
            </span>
          </div>

          {/* Peer / WebRTC status */}
          <PeerStatus connectionState={connectionState} />

          {connectionState === "connected" && (
            <FileTransferUI
              onSendFile={handleSendFile}
              downloadUrl={downloadUrl}
              error={error}
              progress={progress}
            />
          )}
        </div>

        {/* Server connection indicator */}
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]"
            }`}
          />
          <span className="text-xs text-zinc-500">
            {isConnected ? "Connected to server" : "Connecting…"}
          </span>
        </div>
      </main>
    </div>
  );
}

function PeerStatus({ connectionState }: { connectionState: ConnectionState }) {
  if (connectionState === "waiting") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
        <span className="text-sm text-zinc-400">Waiting for peer...</span>
      </div>
    );
  }

  if (connectionState === "connected") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          <span className="text-sm font-medium text-emerald-400">Connected ✓</span>
        </div>
      </div>
    );
  }

  if (connectionState === "failed") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]" />
        <span className="text-sm font-medium text-red-400">Connection Failed</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
      <span className="text-sm text-zinc-400">Connecting...</span>
    </div>
  );
}
