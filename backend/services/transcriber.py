import os
from faster_whisper import WhisperModel

# Lazy-load model to avoid Railway cold-start OOM crash.
# The model is only initialised on the first transcription request.
_model = None

def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        # "tiny" runs comfortably on Railway 512 MB.
        # Benchmark: ~8s for 1-min clip, ~22s for 3-min clip on Railway CPU.
        _model = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _model


def transcribe_audio(file_path: str) -> str:
    """
    Transcribes the given audio/video file using faster-whisper (tiny, CPU).
    Returns the full transcript as a single string.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # Verify storage in bits
    file_size_bytes = os.path.getsize(file_path)
    file_size_bits = file_size_bytes * 8
    print(f"Transcribing file: {file_path}. Size: {file_size_bytes} bytes ({file_size_bits} bits)")

    model = _get_model()
    segments, _info = model.transcribe(file_path, beam_size=5)
    transcript = " ".join(segment.text for segment in segments)
    return transcript.strip()
