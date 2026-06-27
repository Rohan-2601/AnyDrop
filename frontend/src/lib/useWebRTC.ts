"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

export type RTCState = "new" | "connecting" | "connected" | "disconnected" | "failed";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Free TURN server from OpenRelayProject (useful for restrictive NATs/cellular)
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

interface UseWebRTCOptions {
  socket: Socket;
  roomId: string;
  isInitiator: boolean;
  /** Set to true when both peers are in the room */
  peerReady: boolean;
  onMessage?: (msg: string | ArrayBuffer) => void;
}

export function useWebRTC({ socket, roomId, isInitiator, peerReady, onMessage }: UseWebRTCOptions) {
  const [rtcState, setRtcState] = useState<RTCState>("new");
  const [isDataChannelOpen, setIsDataChannelOpen] = useState(false);
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
    setIsDataChannelOpen(false);
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
      dc.binaryType = "arraybuffer";
      dc.onopen = () => {
        console.log(`[WebRTC] Data channel '${dc.label}' open`);
        setIsDataChannelOpen(true);
      };
      dc.onclose = () => {
        console.log(`[WebRTC] Data channel '${dc.label}' closed`);
        setIsDataChannelOpen(false);
      };
      dc.onmessage = (event) => {
        if (typeof event.data === "string") {
          console.log(`[WebRTC] Received message string: ${event.data}`);
        } else {
          console.log(`[WebRTC] Received message binary of size: ${event.data.byteLength}`);
        }
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

  const sendData = useCallback((data: string | ArrayBuffer) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(data as any);
      if (typeof data === "string") {
        console.log(`[WebRTC] Sent string: ${data}`);
      } else {
        console.log(`[WebRTC] Sent binary of size: ${data.byteLength}`);
      }
    } else {
      console.warn(`[WebRTC] Data channel not open, cannot send data.`);
    }
  }, []);

  return { rtcState, isDataChannelOpen, pc: pcRef, sendData };
}
