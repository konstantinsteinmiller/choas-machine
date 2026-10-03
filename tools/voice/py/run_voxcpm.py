"""VoxCPM2 runner.  python run_voxcpm.py <jobs.json> <results.json>

design: text = "(<description>[, <style>])<text>"
clone : with style   -> controllable clone: reference_wav_path only, text = "(<style>)<text>"
        without style -> "ultimate" clone: prompt_wav_path + prompt_text + reference_wav_path
        (job.clone_mode = "controllable" | "ultimate" forces one; ultimate needs ref_text)
Env: VOXCPM_MODEL (default openbmb/VoxCPM2), VOXCPM_OPTIMIZE (default 1 when triton is importable:
     torch.compile + CUDA graphs, ~5x faster on Windows; first run compiles for ~5 min, later ~40 s load),
     VOXCPM_CFG (2.0), VOXCPM_STEPS (10)
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vo_common import read_jobs, run_jobs, style_or_tone  # noqa: E402

MODEL = os.environ.get("VOXCPM_MODEL", "openbmb/VoxCPM2")
CFG = float(os.environ.get("VOXCPM_CFG", "2.0"))
STEPS = int(os.environ.get("VOXCPM_STEPS", "10"))


def want_compile():
    flag = os.environ.get("VOXCPM_OPTIMIZE")
    if flag is not None:
        return flag == "1"
    try:
        import triton  # noqa: F401  (triton-windows on Windows)
        return True
    except ImportError:
        return False


def main():
    jobs, results_path = read_jobs(sys.argv)
    t0 = time.perf_counter()
    from voxcpm import VoxCPM
    model = VoxCPM.from_pretrained(MODEL, load_denoiser=False, optimize=want_compile())
    sr = model.tts_model.sample_rate
    load_s = time.perf_counter() - t0

    def synth(job):
        text = job["text"].strip()
        style = style_or_tone(job)
        kw = dict(cfg_value=CFG, inference_timesteps=STEPS)
        if job["mode"] == "design":
            desc = (job.get("description") or "").strip().rstrip(".")
            control = ", ".join(x for x in (desc, style) if x)
            full = f"({control}){text}" if control else text
            wav = model.generate(text=full, **kw)
            return wav, sr
        if job["mode"] == "clone":
            ref = job["ref_wav"]
            mode = job.get("clone_mode") or ("controllable" if style or not job.get("ref_text") else "ultimate")
            if mode == "ultimate":
                wav = model.generate(text=text, prompt_wav_path=ref, prompt_text=job["ref_text"],
                                     reference_wav_path=ref, **kw)
            else:
                full = f"({style}){text}" if style else text
                wav = model.generate(text=full, reference_wav_path=ref, **kw)
            return wav, sr, f"clone_mode={mode}"
        raise NotImplementedError(f"mode {job['mode']!r}")

    run_jobs(jobs, results_path, "voxcpm", MODEL, load_s, synth)


if __name__ == "__main__":
    main()
