"use client";

import { useMemo } from "react";
import type { RTCState } from "./useWebRTC";

export type ConnectionState = "waiting" | "connecting" | "connected" | "failed";

export function useConnectionState({
  peerReady,
  rtcState,
  isDataChannelOpen,
}: {
  peerReady: boolean;
  rtcState: RTCState;
  isDataChannelOpen: boolean;
}): ConnectionState {
  return useMemo(() => {
    if (!peerReady) return "waiting";
    if (rtcState === "failed") return "failed";
    if (rtcState === "connected" && isDataChannelOpen) return "connected";
    return "connecting";
  }, [peerReady, rtcState, isDataChannelOpen]);
}
