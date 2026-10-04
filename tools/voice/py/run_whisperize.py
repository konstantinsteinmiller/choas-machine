"""Turn voiced takes into true whispers (#126): no TTS engine we run can whisper.

Contract: python run_whisperize.py <jobs.json> <results.json>
  jobs.json    {"jobs": [{id, wav, out, seed?}]}
  results.json {"results": [{id, ok, error?, seconds_audio}]}

A whisper is the same vocal tract with breath instead of a voice: for each
short frame the spectral ENVELOPE of the take is kept (the cepstrum, liftered
so the pitch harmonics are gone) and laid over fresh noise (random phase),
then the frames are overlap-added back. The words and the timbre stay; the
pitch goes. A little of the dry take (8 %) stays under it so consonant
attacks keep their bite. numpy only.
"""
import json
import sys
import wave

import numpy as np


def read_wav(p):
    w = wave.open(p, 'rb')
    n, sr, ch, sw = w.getnframes(), w.getframerate(), w.getnchannels(), w.getsampwidth()
    raw = w.readframes(n)
    w.close()
    if sw == 2:
        x = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    elif sw == 4:
        x = np.frombuffer(raw, dtype=np.int32).astype(np.float64) / 2147483648.0
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        x = v.astype(np.float64) / float(1 << 23)
    else:
        raise ValueError(f'sample width {sw}')
    if ch > 1:
        x = x.reshape(-1, ch).mean(1)
    return x, sr


def write_wav(p, x, sr):
    y = np.clip(x, -1, 1)
    w = wave.open(p, 'wb')
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes((y * 32767).astype(np.int16).tobytes())
    w.close()


def whisperize(x, sr, seed=7):
    rng = np.random.default_rng(seed)
    n = 1 << int(np.ceil(np.log2(0.032 * sr)))
    hop = n // 4
    win = np.hanning(n)
    pad = np.concatenate([np.zeros(n), x, np.zeros(n)])
    out = np.zeros_like(pad)
    norm = np.zeros_like(pad)
    # Lifter: keep the envelope (quefrencies under ~1.2 ms), drop the pitch (2.5-14 ms).
    cut = max(8, int(0.0012 * sr))
    for i in range(0, len(pad) - n, hop):
        f = pad[i:i + n] * win
        spec = np.fft.rfft(f)
        mag = np.abs(spec) + 1e-9
        cep = np.fft.irfft(np.log(mag))
        cep[cut:len(cep) - cut] = 0
        env = np.exp(np.fft.rfft(cep).real)
        noise = np.exp(1j * rng.uniform(0, 2 * np.pi, len(env)))
        frame = np.fft.irfft(env * noise, n) * win
        out[i:i + n] += frame
        norm[i:i + n] += win * win
    out = out / np.maximum(norm, 1e-6)
    y = out[n:n + len(x)]
    # Same loudness as the take, then a trace of the dry take for the attacks.
    rms = lambda v: np.sqrt(np.mean(v * v)) + 1e-12
    y = y * (rms(x) / rms(y))
    return 0.92 * y + 0.08 * x


def main(argv):
    with open(argv[1], 'r', encoding='utf-8') as f:
        jobs = json.load(f).get('jobs', [])
    res = []
    for j in jobs:
        try:
            x, sr = read_wav(j['wav'])
            y = whisperize(x, sr, j.get('seed', 7))
            write_wav(j['out'], y, sr)
            res.append({'id': j['id'], 'ok': True, 'seconds_audio': round(len(y) / sr, 3)})
            print(json.dumps({'id': j['id'], 'ok': True}), flush=True)
        except Exception as e:  # noqa: BLE001
            res.append({'id': j['id'], 'ok': False, 'error': str(e)})
    with open(argv[2], 'w', encoding='utf-8') as f:
        json.dump({'results': res}, f)


if __name__ == '__main__':
    main(sys.argv)
