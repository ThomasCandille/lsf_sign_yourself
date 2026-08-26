import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import "./CameraView.css";

const RECORDING_WIDTH = 640;
const RECORDING_HEIGHT = 480;
const RECORDING_FRAME_RATE = 30;

const RECORDING_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=h264",
  "video/mp4",
  "video/webm;codecs=vp8",
  "video/webm",
];

const CAMERA_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  aspectRatio: { ideal: RECORDING_WIDTH / RECORDING_HEIGHT },
  frameRate: { ideal: RECORDING_FRAME_RATE },
  facingMode: { ideal: "user" },
};

function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }

  return RECORDING_MIME_TYPES.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

function drawCoveredVideoFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
) {
  context.fillStyle = "#000";
  context.fillRect(0, 0, RECORDING_WIDTH, RECORDING_HEIGHT);

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    return;
  }

  const scale = Math.max(
    RECORDING_WIDTH / sourceWidth,
    RECORDING_HEIGHT / sourceHeight,
  );
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (RECORDING_WIDTH - drawWidth) / 2;
  const offsetY = (RECORDING_HEIGHT - drawHeight) / 2;

  context.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
}

export interface CameraViewHandle {
  startRecording: () => void;
  stopRecording: () => Promise<Blob>;
}

interface Props {
  onReady: () => void;
  onError: (msg: string) => void;
}

const CameraView = forwardRef<CameraViewHandle, Props>(
  ({ onReady, onError }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recordingMimeTypeRef = useRef("video/webm");
    const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const stopNormalizedRecordingStream = useCallback(() => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }, []);

    const createNormalizedRecordingStream = useCallback(() => {
      const video = videoRef.current;
      if (!streamRef.current || !video) {
        return streamRef.current;
      }

      const canvas =
        recordingCanvasRef.current ?? document.createElement("canvas");
      recordingCanvasRef.current = canvas;
      canvas.width = RECORDING_WIDTH;
      canvas.height = RECORDING_HEIGHT;

      const context = canvas.getContext("2d");
      if (!context || typeof canvas.captureStream !== "function") {
        return streamRef.current;
      }

      stopNormalizedRecordingStream();
      context.imageSmoothingEnabled = true;

      const renderFrame = () => {
        drawCoveredVideoFrame(context, video);
        animationFrameRef.current = window.requestAnimationFrame(renderFrame);
      };

      renderFrame();
      const normalizedStream = canvas.captureStream(RECORDING_FRAME_RATE);
      recordingStreamRef.current = normalizedStream;
      return normalizedStream;
    }, [stopNormalizedRecordingStream]);

    useEffect(() => {
      let mounted = true;

      if (!window.isSecureContext) {
        onError(
          "La caméra nécessite une connexion HTTPS. Ouvrez le site avec https://.",
        );
        return () => {
          mounted = false;
        };
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        onError("La caméra n'est pas disponible sur ce navigateur.");
        return () => {
          mounted = false;
        };
      }

      navigator.mediaDevices
        .getUserMedia({
          video: CAMERA_VIDEO_CONSTRAINTS,
          audio: false,
        })
        .then((stream) => {
          if (!mounted) return;
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          onReady();
        })
        .catch(() => {
          if (mounted) {
            onError(
              "Impossible d'accéder à la caméra. Vérifiez l'autorisation du navigateur.",
            );
          }
        });

      return () => {
        mounted = false;
        stopNormalizedRecordingStream();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
    }, [onReady, onError, stopNormalizedRecordingStream]);

    useImperativeHandle(
      ref,
      () => ({
        startRecording() {
          if (!streamRef.current) return;
          if (!window.MediaRecorder) {
            onError(
              "L'enregistrement vidéo n'est pas disponible sur ce navigateur.",
            );
            return;
          }

          chunksRef.current = [];
          const mimeType = getSupportedRecordingMimeType();
          const recordingStream = createNormalizedRecordingStream();
          if (!recordingStream) {
            return;
          }

          try {
            const recorder = new MediaRecorder(
              recordingStream,
              mimeType ? { mimeType } : undefined,
            );
            recordingMimeTypeRef.current =
              recorder.mimeType || mimeType || "video/webm";
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.start(300);
            recorderRef.current = recorder;
          } catch {
            stopNormalizedRecordingStream();
            onError(
              "L'enregistrement vidéo n'est pas disponible sur ce navigateur.",
            );
          }
        },

        stopRecording(): Promise<Blob> {
          return new Promise((resolve) => {
            const recorder = recorderRef.current;
            if (!recorder) {
              stopNormalizedRecordingStream();
              resolve(new Blob([]));
              return;
            }
            recorder.onstop = () => {
              stopNormalizedRecordingStream();
              recorderRef.current = null;
              resolve(
                new Blob(chunksRef.current, {
                  type: recordingMimeTypeRef.current,
                }),
              );
            };
            recorder.stop();
          });
        },
      }),
      [
        createNormalizedRecordingStream,
        onError,
        stopNormalizedRecordingStream,
      ],
    );

    return (
      <div className="camera-wrapper">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="camera-feed"
        />
        {/* <div className="body-overlay" aria-hidden="true">
          <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(0, 50)">
              <ellipse cx="100" cy="45" rx="32" ry="38" />
              <line x1="100" y1="83" x2="100" y2="105" />
              <line x1="100" y1="105" x2="40" y2="130" />
              <line x1="100" y1="105" x2="160" y2="130" />
              <line x1="100" y1="105" x2="100" y2="220" />
              <line x1="40" y1="130" x2="18" y2="190" />
              <line x1="18" y1="190" x2="10" y2="250" />
              <line x1="160" y1="130" x2="182" y2="190" />
              <line x1="182" y1="190" x2="190" y2="250" />
            </g>
          </svg>
        </div> */}
      </div>
    );
  },
);

export default CameraView;
