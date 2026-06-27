"use client";

import { useState, useCallback, useRef } from "react";

export interface FileMetadata {
  name: string;
  mime: string;
  size: number;
  totalChunks: number;
}

const CHUNK_SIZE = 64 * 1024; // 64KB

export function useFileTransfer(
  sendData: (data: string | ArrayBuffer) => void,
  waitForBuffer?: () => Promise<void>
) {
  const [incomingMetadata, setIncomingMetadata] = useState<FileMetadata | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ transferred: number; total: number; type: "send" | "receive" } | null>(null);
  
  const incomingChunks = useRef<ArrayBuffer[]>([]);
  const bytesReceived = useRef(0);

  const handleReceiveData = useCallback(
    (data: string | ArrayBuffer) => {
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "file-meta") {
            setIncomingMetadata({
              name: msg.name,
              mime: msg.mime,
              size: msg.size,
              totalChunks: msg.totalChunks,
            });
            incomingChunks.current = [];
            bytesReceived.current = 0;
            setProgress({ transferred: 0, total: msg.size, type: "receive" });
            setDownloadUrl(null);
          } else if (msg.type === "file-complete") {
            if (incomingMetadata) {
              const blob = new Blob(incomingChunks.current, { type: incomingMetadata.mime });
              const url = URL.createObjectURL(blob);
              setDownloadUrl({ url, name: incomingMetadata.name });
              
              setIncomingMetadata(null);
              incomingChunks.current = [];
              bytesReceived.current = 0;
              setProgress(null);
            }
          }
        } catch (e) {
          console.error("Failed to parse message", e);
        }
      } else if (data instanceof ArrayBuffer) {
        if (incomingMetadata) {
          incomingChunks.current.push(data);
          bytesReceived.current += data.byteLength;
          setProgress({ 
            transferred: bytesReceived.current, 
            total: incomingMetadata.size, 
            type: "receive" 
          });
        } else {
          console.warn("Received ArrayBuffer but no metadata was found.");
        }
      }
    },
    [incomingMetadata]
  );

  const handleSendFile = async (file: File) => {
    setError(null);
    setDownloadUrl(null);
    setProgress({ transferred: 0, total: file.size, type: "send" });

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // 1. Send metadata
    sendData(JSON.stringify({ 
      type: "file-meta", 
      name: file.name, 
      mime: file.type,
      size: file.size,
      totalChunks 
    }));

    // 2. Send chunks
    let transferred = 0;
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      
      // Implement backpressure: Wait if the network buffer is full
      if (waitForBuffer) {
        await waitForBuffer();
      }
      
      sendData(buffer);
      
      transferred += buffer.byteLength;
      setProgress({ transferred, total: file.size, type: "send" });
      
      // We no longer strictly need the setTimeout(r, 0) because waitForBuffer
      // yields control to the event loop, but we'll keep a minimal yield
      // just in case the buffer never fills up and we block the UI thread.
      if (offset % (CHUNK_SIZE * 16) === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // 3. Send completion signal
    sendData(JSON.stringify({ type: "file-complete" }));
    
    // Small delay to show 100% then hide
    setTimeout(() => {
      setProgress(null);
    }, 500);
  };

  return { handleReceiveData, handleSendFile, downloadUrl, error, progress };
}
