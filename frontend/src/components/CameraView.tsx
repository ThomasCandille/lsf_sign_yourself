import React, {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import "./CameraView.css";

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
  frameRate: { ideal: 30 },
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
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
    }, [onReady, onError]);

    useImperativeHandle(ref, () => ({
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
        const recorder = new MediaRecorder(
          streamRef.current,
          mimeType ? { mimeType } : undefined,
        );
        recordingMimeTypeRef.current =
          recorder.mimeType || mimeType || "video/webm";
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(300);
        recorderRef.current = recorder;
      },

      stopRecording(): Promise<Blob> {
        return new Promise((resolve) => {
          const recorder = recorderRef.current;
          if (!recorder) {
            resolve(new Blob([]));
            return;
          }
          recorder.onstop = () => {
            resolve(
              new Blob(chunksRef.current, {
                type: recordingMimeTypeRef.current,
              }),
            );
          };
          recorder.stop();
        });
      },
    }));

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
