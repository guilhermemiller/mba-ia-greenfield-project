/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadForm } from "../upload-form";

import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";

describe("UploadForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the initial idle state", () => {
    render(<UploadForm />);
    expect(screen.getByText(/Selecione o vídeo para upload/i)).toBeInTheDocument();
  });

  it("shows an error when trying to upload a non-video file", async () => {
    render(<UploadForm />);
    const file = new File(["test data"], "test.txt", { type: "text/plain" });
    const input = document.querySelector("input[type=file]") as HTMLInputElement;

    await userEvent.upload(input, file);

    expect(screen.getByText(/Por favor, selecione um arquivo de vídeo válido/i)).toBeInTheDocument();
  });

  it("transitions to selecting state when a valid video is selected", async () => {
    render(<UploadForm />);
    const file = new File(["video data"], "video.mp4", { type: "video/mp4" });
    const input = document.querySelector("input[type=file]") as HTMLInputElement;

    await userEvent.upload(input, file);

    expect(screen.getByText("video.mp4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Iniciar Upload/i })).toBeInTheDocument();
  });

  it("completes the full upload flow successfully", async () => {
    server.use(
      http.post("/api/videos/initiate-upload", () => {
        return HttpResponse.json({
          videoId: "v123",
          uploadId: "up123",
          partSize: 1024,
          partCount: 1,
        }, { status: 201 });
      }),
      http.get("/api/videos/:id/presign-part", () => {
        return HttpResponse.json({
          partUrl: "http://minio/presigned-url",
        }, { status: 200 });
      }),
      http.put("http://minio/presigned-url", () => {
        return new HttpResponse(null, { headers: { ETag: "12345etag" }, status: 200 });
      }),
      http.post("/api/videos/:id/complete", () => {
        return HttpResponse.json({}, { status: 200 });
      })
    );

    render(<UploadForm />);
    const file = new File(["video data"], "video.mp4", { type: "video/mp4" });
    const input = document.querySelector("input[type=file]") as HTMLInputElement;

    await userEvent.upload(input, file);

    const startButton = screen.getByRole("button", { name: /Iniciar Upload/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText(/Upload concluído!/i)).toBeInTheDocument();
    });
  });
});
