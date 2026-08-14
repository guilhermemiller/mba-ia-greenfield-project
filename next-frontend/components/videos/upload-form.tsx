"use client";

import * as React from "react";
import { UploadIcon } from "@/components/icons/upload-icon";
import { XIcon } from "@/components/icons/x-icon";
import { CheckCircleIcon } from "@/components/icons/check-circle-icon";
import { FileVideoIcon } from "@/components/icons/file-video-icon";
import { AlertCircleIcon } from "@/components/icons/alert-circle-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CompleteUploadDto } from "@/lib/api/contracts";
import { cn } from "@/lib/utils";



// Types
type UploadState =
  | "idle"
  | "selecting"
  | "initiating"
  | "uploading"
  | "completing"
  | "success"
  | "error";

export function UploadForm() {
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<UploadState>("idle");
  const [progress, setProgress] = React.useState<number>(0);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [, setUploadId] = React.useState<string | null>(null);
  const [videoId, setVideoId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.type.startsWith("video/")) {
        setState("error");
        setErrorMsg("Por favor, selecione um arquivo de vídeo válido.");
        return;
      }
      if (selected.size > 10 * 1024 * 1024 * 1024) {
        setState("error");
        setErrorMsg("O tamanho do vídeo não pode exceder 10GB.");
        return;
      }
      setFile(selected);
      setErrorMsg(null);
      setState("selecting");
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (state === "idle" || state === "selecting" || state === "error") {
      e.currentTarget.classList.add("border-primary", "bg-primary/5");
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-primary", "bg-primary/5");
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-primary", "bg-primary/5");
    if (state !== "idle" && state !== "selecting" && state !== "error") return;

    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      if (!dropped.type.startsWith("video/")) {
        setState("error");
        setErrorMsg("Por favor, selecione um arquivo de vídeo válido.");
        return;
      }
      if (dropped.size > 10 * 1024 * 1024 * 1024) {
        setState("error");
        setErrorMsg("O tamanho do vídeo não pode exceder 10GB.");
        return;
      }
      setFile(dropped);
      setErrorMsg(null);
      setState("selecting");
    }
  };

  const resetState = () => {
    setFile(null);
    setState("idle");
    setProgress(0);
    setErrorMsg(null);
    setUploadId(null);
    setVideoId(null);
    abortControllerRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const cancelUpload = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (videoId && state !== "success") {
      try {
        await fetch(`/api/videos/${videoId}/abort`, { method: "POST" });
      } catch (err) {
        console.error("Failed to abort upload on the server:", err);
      }
    }
    resetState();
  };

  const startUpload = async () => {
    if (!file) return;

    try {
      setState("initiating");
      setProgress(0);
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // 1. Initiate upload
      const initRes = await fetch("/api/videos/initiate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "video/mp4",
          size: file.size,
        }),
        signal,
      });

      const responseData = await initRes.json();

      if (!initRes.ok) {
        throw new Error(responseData.message || "Falha ao iniciar o upload");
      }

      const {
        videoId: newVideoId,
        uploadId: newUploadId,
        partSize,
        partCount,
      } = responseData;
      setVideoId(newVideoId);
      setUploadId(newUploadId);

      setState("uploading");

      // 2. Upload parts
      const parts: CompleteUploadDto["parts"] = [];
      let uploadedBytes = 0;

      for (let i = 1; i <= partCount; i++) {
        // Abort check
        if (signal.aborted) throw new Error("Upload cancelado");

        // Get presigned URL
        const presignRes = await fetch(
          `/api/videos/${newVideoId}/presign-part?partNumber=${i}`,
          {
            signal,
          },
        );

        if (!presignRes.ok) {
          throw new Error("Falha ao obter URL de upload");
        }

        const { partUrl } = await presignRes.json();

        // Slice file
        const start = (i - 1) * partSize;
        const end = Math.min(start + partSize, file.size);
        const slice = file.slice(start, end);

        // Upload slice
        const uploadRes = await fetch(partUrl, {
          method: "PUT",
          body: slice,
          signal,
        });

        if (!uploadRes.ok) {
          const text = await uploadRes.text().catch(() => '');
          console.error('Upload part error response:', uploadRes.status, uploadRes.statusText, text);
          throw new Error(`Falha ao enviar parte ${i} (Status: ${uploadRes.status})`);
        }

        // Get ETag (some servers wrap it in quotes, some don't - we pass it exactly as received)
        const etag =
          uploadRes.headers.get("ETag") || uploadRes.headers.get("etag");
        if (!etag) {
          // If we can't get ETag (e.g. CORS), we might have to rely on a fallback or it might fail Complete.
          // S3 requires it.
          console.warn(
            `Part ${i} uploaded but ETag missing from response headers.`,
          );
        }

        parts.push({
          partNumber: i,
          etag: etag || "", // Must pass string
        });

        uploadedBytes += slice.size;
        setProgress(Math.round((uploadedBytes / file.size) * 100));
      }

      setState("completing");

      // 3. Complete upload
      const completeRes = await fetch(`/api/videos/${newVideoId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts }),
        signal,
      });

      if (!completeRes.ok) {
        throw new Error("Falha ao finalizar o upload");
      }

      setState("success");
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError" || error.message === "Upload cancelado") {
        // User cancelled, state is already handled by cancelUpload
        return;
      }

      console.error("Upload error:", err);
      setState("error");
      setErrorMsg(error.message || "Ocorreu um erro inesperado durante o upload");

      // Auto-abort on backend if failed mid-flight
      if (videoId) {
        try {
          await fetch(`/api/videos/${videoId}/abort`, { method: "POST" });
        } catch (abortErr) {
          console.error("Failed to abort failed upload:", abortErr);
        }
      }
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-md">
      <CardContent className="p-8">
        {/* Upload Area */}
        {(state === "idle" || state === "error" || state === "selecting") && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
              state === "selecting"
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
              state === "error" && "border-destructive/50 bg-destructive/5",
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="p-4 bg-muted rounded-full">
                <UploadIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-semibold tracking-tight">
                  Selecione o vídeo para upload
                </h3>
                <p className="text-sm text-muted-foreground">
                  ou arraste e solte o arquivo aqui
                </p>
              </div>
              <div className="text-xs text-muted-foreground/75 mt-4">
                Arquivos MP4, WebM ou OGG (Máx. 10GB)
              </div>
            </div>
          </div>
        )}

        {/* Selected File Details */}
        {state === "selecting" && file && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center space-x-3 overflow-hidden">
                <FileVideoIcon className="w-8 h-8 text-primary shrink-0" />
                <div className="truncate">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  resetState();
                }}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <XIcon className="w-5 h-5" />
              </Button>
            </div>

            <Button className="w-full" size="md" onClick={startUpload}>
              Iniciar Upload
            </Button>
          </div>
        )}

        {/* Active Upload */}
        {(state === "initiating" ||
          state === "uploading" ||
          state === "completing") &&
          file && (
            <div className="space-y-6 py-4">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative flex items-center justify-center w-16 h-16">
                  <svg
                    className="w-full h-full -rotate-90"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      className="text-muted stroke-current"
                      strokeWidth="8"
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                    ></circle>
                    <circle
                      className="text-primary stroke-current transition-all duration-300 ease-in-out"
                      strokeWidth="8"
                      strokeLinecap="round"
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      strokeDasharray={`${progress * 2.51}, 251.2`}
                    ></circle>
                  </svg>
                  <div className="absolute text-sm font-semibold">
                    {progress}%
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium">
                    {state === "initiating"
                      ? "Iniciando upload..."
                      : state === "completing"
                        ? "Finalizando..."
                        : "Enviando vídeo..."}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 truncate max-w-[250px] mx-auto">
                    {file.name}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full text-destructive hover:bg-destructive/10"
                onClick={cancelUpload}
              >
                Cancelar Upload
              </Button>
            </div>
          )}

        {/* Error State */}
        {state === "error" && (
          <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start space-x-3">
            <AlertCircleIcon className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-destructive">
                Erro no upload
              </h4>
              <p className="text-sm text-destructive/90 mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Success State */}
        {state === "success" && (
          <div className="py-8 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-2">
              <CheckCircleIcon className="w-8 h-8 text-green-600 dark:text-green-500" />
            </div>
            <div>
              <h3 className="text-2xl font-bold tracking-tight">
                Upload concluído!
              </h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                Seu vídeo foi enviado com sucesso e está na fila de
                processamento. Você será notificado quando estiver pronto para
                visualização.
              </p>
            </div>
            <Button className="mt-6" size="md" onClick={resetState}>
              Enviar outro vídeo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
