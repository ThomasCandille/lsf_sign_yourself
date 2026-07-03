import os
import uuid


def upload_tensor(npy_bytes: bytes, word_id: str, pseudo: str) -> str:
    """Save a .npy tensor to local storage. Returns the file path."""
    storage_path = os.getenv("TENSOR_STORAGE_PATH", "./tensors")
    os.makedirs(storage_path, exist_ok=True)

    filename = f"{word_id}__{pseudo}.npy"
    filepath = os.path.join(storage_path, filename)
    with open(filepath, "wb") as f:
        f.write(npy_bytes)
    return filepath
