"""Qwen3-TTS runner.  python run_qwen.py <jobs.json> <results.json>

design: VoiceDesign model, instruct = "<description> <style>" (style/tone appended as delivery direction)
clone : Base model, ICL prompt from ref_wav + ref_text (x-vector-only when ref_text is missing).
        The Base model takes no instruct -> style/tone ignored (reported as a warning).
Only the models the jobs need are loaded (each once). Clone prompts are cached per (ref_wav, ref_text).
Env: QWEN_DESIGN_MODEL, QWEN_BASE_MODEL, QWEN_ATTN (sdpa)
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vo_common import LANG_NAMES, read_jobs, run_jobs, style_or_tone  # noqa: E402

DESIGN_MODEL = os.environ.get("QWEN_DESIGN_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
BASE_MODEL = os.environ.get("QWEN_BASE_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
ATTN = os.environ.get("QWEN_ATTN", "sdpa")


def main():
    jobs, results_path = read_jobs(sys.argv)
    import torch
    from qwen_tts import Qwen3TTSModel

    def load(mid):
        return Qwen3TTSModel.from_pretrained(mid, device_map="cuda:0", dtype=torch.bfloat16,
                                             attn_implementation=ATTN)

    t0 = time.perf_counter()
    modes = {j.get("mode") for j in jobs}
    design_model = load(DESIGN_MODEL) if "design" in modes else None
    base_model = load(BASE_MODEL) if "clone" in modes else None
    load_s = time.perf_counter() - t0
    prompt_cache = {}

    def synth(job):
        lang = LANG_NAMES.get(job.get("lang"), "Auto")
        text = job["text"].strip()
        style = style_or_tone(job)
        if job["mode"] == "design":
            desc = (job.get("description") or "").strip()
            if desc and not desc.endswith((".", "!", "?")):
                desc += "."
            instruct = " ".join(x for x in (desc, f"Delivery: {style}." if style else "") if x)
            wavs, sr = design_model.generate_voice_design(text=text, language=lang, instruct=instruct)
            return wavs[0], sr
        if job["mode"] == "clone":
            ref, ref_text = job["ref_wav"], job.get("ref_text") or None
            key = (os.path.abspath(ref), ref_text)
            if key not in prompt_cache:
                prompt_cache[key] = base_model.create_voice_clone_prompt(
                    ref_audio=ref, ref_text=ref_text, x_vector_only_mode=ref_text is None)
            wavs, sr = base_model.generate_voice_clone(text=text, language=lang,
                                                       voice_clone_prompt=prompt_cache[key])
            warn = f"style ignored (Base clone model has no instruct): {style}" if style else None
            return wavs[0], sr, warn
        raise NotImplementedError(f"mode {job['mode']!r}")

    model_name = " + ".join(m for m, used in ((DESIGN_MODEL, design_model), (BASE_MODEL, base_model)) if used is not None)
    run_jobs(jobs, results_path, "qwen3-tts", model_name, load_s, synth)


if __name__ == "__main__":
    main()
