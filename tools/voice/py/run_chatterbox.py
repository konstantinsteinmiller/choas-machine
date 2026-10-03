"""Chatterbox Multilingual V3 runner.  python run_chatterbox.py <jobs.json> <results.json>

design: unsupported (no voice-design mode) -> ok=false, error "unsupported: ..."
clone : ChatterboxMultilingualTTS.generate(text, language_id=lang, audio_prompt_path=ref_wav,
        exaggeration, cfg_weight). ref_text is not used. Free-text style is not supported; the
        one-word tone maps to exaggeration/cfg_weight. With no tone, the first tone word found in
        style is used; else neutral. job.exaggeration / job.cfg_weight override the map.
Env: CHATTERBOX_T3 (default v3)
"""
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vo_common import TONES, read_jobs, run_jobs  # noqa: E402

T3 = os.environ.get("CHATTERBOX_T3", "v3")
TONE_MAP = {  # tone -> (exaggeration, cfg_weight)
    "calm": (0.3, 0.5), "deadpan": (0.3, 0.5), "whisper": (0.3, 0.5), "sad": (0.3, 0.5),
    "neutral": (0.5, 0.5), "warm": (0.5, 0.5),
    "cheeky": (0.6, 0.45),
    "excited": (0.75, 0.4), "urgent": (0.75, 0.4),
    "shout": (0.9, 0.3), "menacing": (0.9, 0.3), "laugh": (0.9, 0.3), "pained": (0.9, 0.3),
}


def pick_tone(job):
    tone = (job.get("tone") or "").strip().lower()
    if tone in TONE_MAP:
        return tone, None
    words = re.findall(r"[a-z]+", (job.get("style") or "").lower())
    for w in words:
        for t in TONES:
            if w == t or (len(w) > 4 and w.startswith(t[:5])):  # shouting->shout, whispering->whisper
                return t, f"tone '{t}' derived from style"
    return "neutral", (f"unknown tone '{tone}', used neutral" if tone else None)


def main():
    jobs, results_path = read_jobs(sys.argv)
    t0 = time.perf_counter()
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    model = ChatterboxMultilingualTTS.from_pretrained(device="cuda", t3_model=T3)
    load_s = time.perf_counter() - t0

    def synth(job):
        if job["mode"] != "clone":
            raise NotImplementedError("Chatterbox has no voice-design mode; clone from a reference wav")
        tone, note = pick_tone(job)
        exag, cfg = TONE_MAP[tone]
        exag = float(job.get("exaggeration", exag))
        cfg = float(job.get("cfg_weight", cfg))
        warnings = [f"tone={tone} exaggeration={exag} cfg_weight={cfg}"]
        if note:
            warnings.append(note)
        if tone == "whisper":
            warnings.append("whisper is unsupported by Chatterbox (rendered as calm, voiced speech)")
        if job.get("style"):
            warnings.append("free-text style not supported (tone mapping only)")
        wav = model.generate(job["text"].strip(), language_id=job.get("lang", "en"),
                             audio_prompt_path=job["ref_wav"], exaggeration=exag, cfg_weight=cfg)
        return wav, model.sr, "; ".join(warnings)

    run_jobs(jobs, results_path, "chatterbox", f"ResembleAI/chatterbox multilingual t3={T3}", load_s, synth)


if __name__ == "__main__":
    main()
