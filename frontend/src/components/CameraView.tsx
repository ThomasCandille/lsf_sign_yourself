import React, { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import "./CameraView.css";

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

    useEffect(() => {
      let mounted = true;
      navigator.mediaDevices
        .getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false })
        .then((stream) => {
          if (!mounted) return;
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          onReady();
        })
        .catch(() => {
          if (mounted) onError("Impossible d'accéder à la caméra.");
        });

      return () => {
        mounted = false;
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
    }, [onReady, onError]);

    useImperativeHandle(ref, () => ({
      startRecording() {
        if (!streamRef.current) return;
        chunksRef.current = [];
        const recorder = new MediaRecorder(streamRef.current, {
          mimeType: "video/webm;codecs=vp8",
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(100);
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
            resolve(new Blob(chunksRef.current, { type: "video/webm" }));
          };
          recorder.stop();
        });
      },
    }));

    return (
      <div className="camera-wrapper">
        <video ref={videoRef} autoPlay muted playsInline className="camera-feed" />
        <div className="body-overlay" aria-hidden="true">
          <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(0, 50)">
              {/* head */}
              <ellipse cx="100" cy="45" rx="32" ry="38" />
              {/* neck */}
              <line x1="100" y1="83" x2="100" y2="105" />
              {/* shoulders */}
              <line x1="100" y1="105" x2="40" y2="130" />
              <line x1="100" y1="105" x2="160" y2="130" />
              {/* torso */}
              <line x1="100" y1="105" x2="100" y2="220" />
              {/* left arm */}
              <line x1="40" y1="130" x2="18" y2="190" />
              <line x1="18" y1="190" x2="10" y2="250" />
              {/* right arm */}
              <line x1="160" y1="130" x2="182" y2="190" />
              <line x1="182" y1="190" x2="190" y2="250" />
            </g>
          </svg>
        </div>
      </div>
    );
  }
);

export default CameraView;
