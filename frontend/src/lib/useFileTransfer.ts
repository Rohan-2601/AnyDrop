"use client";

import { useState, useCallback, useRef } from "react";

export interface FileMetadata {
  name: string;
  mime: string;
  size: number;
  totalChunks: number;
}

const CHUNK_SIZE = 256 * 1024; // 256KB

export function useFileTransfer(
  sendData: (data: string | ArrayBuffer) => void,
  waitForBuffer?: () => Promise<void>
) {
  const [incomingOffer, setIncomingOffer] = useState<FileMetadata | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ transferred: number; total: number; type: "send" | "receive" } | null>(null);
  
  const incomingChunks = useRef<ArrayBuffer[]>([]);
  const bytesReceived = useRef(0);
  const acceptResolver = useRef<((accepted: boolean) => void) | null>(null);
  const fileStream = useRef<any>(null); // FileSystemWritableFileStream

  const handleReceiveData = useCallback(
    (data: string | ArrayBuffer) => {
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "file-meta") {
            setIncomingOffer({
              name: msg.name,
              mime: msg.mime,
              size: msg.size,
              totalChunks: msg.totalChunks,
            });
            incomingChunks.current = [];
            bytesReceived.current = 0;
            setProgress(null);
            setDownloadUrl(null);
          } else if (msg.type === "file-accept") {
            if (acceptResolver.current) {
              acceptResolver.current(true);
              acceptResolver.current = null;
            }
          } else if (msg.type === "file-reject") {
            if (acceptResolver.current) {
              acceptResolver.current(false);
              acceptResolver.current = null;
            }
          } else if (msg.type === "file-complete") {
            if (incomingOffer) {
              if (fileStream.current) {
                // Direct-to-disk
                fileStream.current.close().catch(console.error);
                fileStream.current = null;
              } else {
                // Fallback in-memory blob
                const blob = new Blob(incomingChunks.current, { type: incomingOffer.mime });
                const url = URL.createObjectURL(blob);
                setDownloadUrl({ url, name: incomingOffer.name });
              }
              setIncomingOffer(null);
              incomingChunks.current = [];
              bytesReceived.current = 0;
              setProgress(null);
            }
          }
        } catch (e) {
          console.error("Failed to parse message", e);
        }
      } else if (data instanceof ArrayBuffer) {
        if (incomingOffer) {
          if (fileStream.current) {
            fileStream.current.write(data).catch(console.error);
          } else {
            incomingChunks.current.push(data);
          }
          bytesReceived.current += data.byteLength;
          setProgress({ 
            transferred: bytesReceived.current, 
            total: incomingOffer.size, 
            type: "receive" 
          });
        }
      }
    },
    [incomingOffer]
  );

  const acceptOffer = async () => {
    if (!incomingOffer) return;
    try {
      if ('showSaveFilePicker' in window) {
        // Feature detection for direct-to-disk
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: incomingOffer.name,
        });
        fileStream.current = await handle.createWritable();
      }
      sendData(JSON.stringify({ type: "file-accept" }));
      setProgress({ transferred: 0, total: incomingOffer.size, type: "receive" });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(e);
        setError("Could not access file system.");
      }
      rejectOffer();
    }
  };

  const rejectOffer = () => {
    setIncomingOffer(null);
    sendData(JSON.stringify({ type: "file-reject" }));
  };

  const handleSendFile = async (file: File) => {
    setError(null);
    setDownloadUrl(null);
    setProgress(null); // Waiting for accept

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // 1. Send metadata
    sendData(JSON.stringify({ 
      type: "file-meta", 
      name: file.name, 
      mime: file.type,
      size: file.size,
      totalChunks 
    }));

    // 2. Wait for receiver to accept or reject
    const accepted = await new Promise<boolean>((resolve) => {
      acceptResolver.current = resolve;
    });

    if (!accepted) {
      setError("Transfer was rejected by the receiver.");
      return;
    }

    setProgress({ transferred: 0, total: file.size, type: "send" });

    // 3. Send chunks
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
      
      // Keep event loop breathing
      if (offset % (CHUNK_SIZE * 16) === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // 4. Send completion signal
    sendData(JSON.stringify({ type: "file-complete" }));
    
    setTimeout(() => setProgress(null), 500);
  };

  return { handleReceiveData, handleSendFile, acceptOffer, rejectOffer, incomingOffer, downloadUrl, error, progress };
}
