"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

interface FileTransferUIProps {
  onSendFile: (file: File) => void;
  downloadUrl: { url: string; name: string } | null;
  error: string | null;
  progress: { transferred: number; total: number; type: "send" | "receive" } | null;
}

export function FileTransferUI({ onSendFile, downloadUrl, error, progress }: FileTransferUIProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      onSendFile(file);
    }
  }, [onSendFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    multiple: false 
  });

  return (
    <div className="mt-6 flex flex-col items-center gap-4 border-t border-zinc-800/60 pt-6 w-full">
      <div 
        {...getRootProps()} 
        className={`flex flex-col items-center justify-center w-full min-h-[160px] p-6 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
          isDragActive 
            ? "border-indigo-500 bg-indigo-500/10" 
            : "border-zinc-700 bg-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-600"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-zinc-800 p-3 text-zinc-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
          </div>
          {selectedFile ? (
            <div>
              <p className="text-sm font-semibold text-zinc-200">{selectedFile.name}</p>
              <p className="text-xs text-zinc-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-zinc-300">
                {isDragActive ? "Drop the file here..." : "Drag & drop a file here"}
              </p>
              <p className="text-xs text-zinc-500 mt-1">or click to select from your computer</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm font-medium text-red-400 bg-red-400/10 px-3 py-1.5 rounded">
          {error}
        </p>
      )}

      {progress && (
        <div className="w-full flex flex-col gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
          <div className="flex justify-between text-sm font-medium text-zinc-300">
            <span>{progress.type === "send" ? "Sending..." : "Receiving..."}</span>
            <span>{Math.round((progress.transferred / progress.total) * 100)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, (progress.transferred / progress.total) * 100))}%` }}
            />
          </div>
          <div className="text-xs text-zinc-500 text-right font-mono">
            {(progress.transferred / (1024 * 1024)).toFixed(2)} MB / {(progress.total / (1024 * 1024)).toFixed(2)} MB
          </div>
        </div>
      )}

      {downloadUrl && (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-emerald-500/10 p-4 border border-emerald-500/20 w-full">
          <p className="text-sm font-medium text-emerald-400">File Received!</p>
          <a
            href={downloadUrl.url}
            download={downloadUrl.name}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download {downloadUrl.name}
          </a>
        </div>
      )}
    </div>
  );
}
