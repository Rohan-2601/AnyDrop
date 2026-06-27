"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

export type RTCState = "new" | "connecting" | "connected" | "disconnected" | "failed";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

interface UseWebRTCOptions {
  socket: Socket;
  roomId: string;
  isInitiator: boolean;
  /** Set to true when both peers are in the room */
  peerReady: boolean;
  onMessage?: (msg: string) => void;
}

export function useWebRTC({ socket, roomId, isInitiator, peerReady, onMessage }: UseWebRTCOptions) {
  const [rtcState, setRtcState] = useState<RTCState>("new");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRtcState("new");
  }, []);

  useEffect(() => {
    // Don't start WebRTC until both peers are in the room and socket is live
    if (!peerReady || !socket.connected) {
      cleanup();
      return;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    setRtcState("connecting");

    // --- ICE candidate handling ---
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { roomId, candidate: event.candidate.toJSON() });
      }
    };

    // --- Connection state tracking ---
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] connectionState: ${state}`);
      if (state === "connected") setRtcState("connected");
      else if (state === "failed") setRtcState("failed");
      else if (state === "disconnected") setRtcState("disconnected");
      else if (state === "connecting") setRtcState("connecting");
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] iceConnectionState: ${pc.iceConnectionState}`);
    };

    const setupDataChannel = (dc: RTCDataChannel) => {
      dcRef.current = dc;
      dc.onopen = () => console.log(`[WebRTC] Data channel '${dc.label}' open`);
      dc.onclose = () => console.log(`[WebRTC] Data channel '${dc.label}' closed`);
      dc.onmessage = (event) => {
        console.log(`[WebRTC] Received message: ${event.data}`);
        onMessage?.(event.data);
      };
    };

    // --- Data channel (needed to trigger ICE negotiation and transfer data) ---
    if (isInitiator) {
      const dc = pc.createDataChannel("transfer");
      setupDataChannel(dc);
    }

    pc.ondatachannel = (event) => {
      console.log(`[WebRTC] Received data channel: ${event.channel.label}`);
      if (event.channel.label === "transfer") {
        setupDataChannel(event.channel);
      }
    };

    // --- Signaling handlers ---
    const handleOffer = async (data: { sdp: RTCSessionDescriptionInit }) => {
      console.log("[WebRTC] Received offer");
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

      // Flush queued ICE candidates
      for (const candidate of iceCandidateQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidateQueue.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { roomId, sdp: answer });
      console.log("[WebRTC] Sent answer");
    };

    const handleAnswer = async (data: { sdp: RTCSessionDescriptionInit }) => {
      console.log("[WebRTC] Received answer");
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

      // Flush queued ICE candidates
      for (const candidate of iceCandidateQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidateQueue.current = [];
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        // Queue candidates that arrive before remote description is set
        iceCandidateQueue.current.push(data.candidate);
      }
    };

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    // --- Initiator creates the offer ---
    if (isInitiator) {
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { roomId, sdp: offer });
        console.log("[WebRTC] Sent offer");
      })();
    }

    return () => {
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
      pc.close();
      pcRef.current = null;
    };
  }, [socket, roomId, isInitiator, peerReady, cleanup]);

  const sendMessage = useCallback((msg: string) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(msg);
      console.log(`[WebRTC] Sent message: ${msg}`);
    } else {
      console.warn(`[WebRTC] Data channel not open, cannot send: ${msg}`);
    }
  }, []);

  return { rtcState, pc: pcRef, sendMessage };
}
