"""faster-whisper QA transcription.  python run_whisper.py <jobs.json> <results.json>

jobs:    {"jobs":[{"id","wav","lang","prompt?"}]}   (lang "en"/"de"; omit or "auto" to detect;
         prompt = optional initial_prompt to bias spelling of names, e.g. "Flux, Cyber City")
results: {"results":[{"id","text","seconds_wall","language","language_probability","error?"}],
          "engine","model","load_seconds"}
Env: WHISPER_MODEL (default large-v3-turbo; or large-v3), WHISPER_DEVICE (cuda), WHISPER_COMPUTE (float16)
"""
import glob
import json
import os
import sys
import time


def add_cuda_dlls():
    """ctranslate2 on Windows needs cuBLAS 12 + cuDNN 9 DLLs: take them from the nvidia-* pip wheels."""
    if os.name != "nt":
        return
    for d in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        os.add_dll_directory(d)
        os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def main():
    if len(sys.argv) < 3:
        print("usage: python run_whisper.py <jobs.json> <results.json>", file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        jobs = json.load(f).get("jobs", [])
    add_cuda_dlls()
    from faster_whisper import WhisperModel
    name = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
    t0 = time.perf_counter()
    model = WhisperModel(name, device=os.environ.get("WHISPER_DEVICE", "cuda"),
                         compute_type=os.environ.get("WHISPER_COMPUTE", "float16"))
    load_s = time.perf_counter() - t0
    results = []
    for job in jobs:
        t = time.perf_counter()
        rec = {"id": job.get("id"), "text": ""}
        try:
            lang = job.get("lang")
            segs, info = model.transcribe(job["wav"], language=None if lang in (None, "", "auto") else lang,
                                          beam_size=5, vad_filter=False, condition_on_previous_text=False,
                                          initial_prompt=job.get("prompt") or None)
            rec["text"] = " ".join(s.text.strip() for s in segs).strip()
            rec["language"] = info.language
            rec["language_probability"] = round(float(info.language_probability), 3)
        except Exception as e:
            rec["error"] = f"{type(e).__name__}: {e}"
        rec["seconds_wall"] = round(time.perf_counter() - t, 3)
        print(json.dumps(rec, ensure_ascii=False), flush=True)
        results.append(rec)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump({"results": results, "engine": "faster-whisper", "model": name,
                   "load_seconds": round(load_s, 2)}, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
