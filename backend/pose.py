import io
import tempfile
import os
import numpy as np
import cv2
import mediapipe as mp

_holistic = None


def _get_holistic():
    global _holistic
    if _holistic is None:
        _holistic = mp.solutions.holistic.Holistic(
            static_image_mode=False,
            model_complexity=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
    return _holistic


def _landmarks_to_array(landmarks, n: int) -> np.ndarray:
    if landmarks is None:
        return np.zeros((n, 3), dtype=np.float32)
    return np.array([[lm.x, lm.y, lm.z] for lm in landmarks.landmark], dtype=np.float32)


def extract_pose_tensor(video_bytes: bytes) -> np.ndarray:
    """
    Returns a float32 array of shape (N_FRAMES, 543, 3).
    543 = 33 pose + 21 left_hand + 21 right_hand + 468 face landmarks.
    """
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(video_bytes)
        tmp_path = f.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        holistic = _get_holistic()
        frames = []

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = holistic.process(rgb)

            pose = _landmarks_to_array(results.pose_landmarks, 33)
            left_hand = _landmarks_to_array(results.left_hand_landmarks, 21)
            right_hand = _landmarks_to_array(results.right_hand_landmarks, 21)
            face = _landmarks_to_array(results.face_landmarks, 468)

            frame_landmarks = np.concatenate([pose, left_hand, right_hand, face], axis=0)
            frames.append(frame_landmarks)

        cap.release()
    finally:
        os.unlink(tmp_path)

    if not frames:
        raise ValueError("No frames extracted from video")

    return np.stack(frames, axis=0).astype(np.float32)
