# Procedural SFX for Relic Rush (stdlib only). Run: python3 scripts/gen-sfx.py
import wave, math, random, struct
R = 22050
random.seed(9)
def write(name, samples, vol=0.5):
    peak = max(1e-6, max(abs(x) for x in samples))
    with wave.open(f'assets/audio/{name}.wav', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(R)
        w.writeframes(b''.join(struct.pack('<h', int(32767 * vol * x / peak)) for x in samples))
def env(i, n, a=0.005, curve=3.0):
    t = i / R; at = a
    return min(1, t / at) * (1 - i / n) ** curve
def sweep(dur, f0, f1, shape='sq', noise=0.0, curve=2.0):
    n = int(R * dur); out = []; ph = 0
    for i in range(n):
        f = f0 + (f1 - f0) * (i / n); ph += 2 * math.pi * f / R
        v = math.sin(ph) if shape == 'sin' else (1 if math.sin(ph) > 0 else -1) * 0.6 + math.sin(ph) * 0.4
        v = v * (1 - noise) + (random.random() * 2 - 1) * noise
        out.append(v * env(i, n, curve=curve))
    return out
def mix(*parts):
    n = max(len(p) for p in parts); return [sum(p[i] for p in parts if i < len(p)) for i in range(n)]
def lowpass(x, k=0.2):
    y = 0; o = []
    for v in x: y += k * (v - y); o.append(y)
    return o
write('sfx-jump', sweep(0.16, 260, 620, curve=1.5), 0.42)
write('sfx-slide', lowpass(sweep(0.26, 900, 300, noise=0.85, curve=1.2), 0.25), 0.4)
write('sfx-pickup', sweep(0.06, 990, 990, 'sin') + sweep(0.12, 1480, 1480, 'sin', curve=3), 0.36)
write('sfx-turn', mix(sweep(0.14, 520, 780, 'sin'), [0] * int(R * 0.05) + sweep(0.12, 780, 1040, 'sin')), 0.38)
hit = mix(sweep(0.55, 140, 38, noise=0.35, curve=2.2), lowpass(sweep(0.4, 400, 100, noise=1.0, curve=3), 0.15))
write('sfx-hit', hit, 0.6)
write('sfx-stage', mix(sweep(0.9, 196, 196, 'sin', curve=1.6), sweep(0.9, 294, 296, 'sin', curve=1.6), [0] * int(R * 0.18) + sweep(0.7, 392, 392, 'sin', curve=2)), 0.4)
# A short reusable pursuit loop: paired shoe impacts and filtered breathing.
pursuit = [0.0] * int(R * 1.6)
for at in [0, 0.29, 0.64, 0.93, 1.28]:
    foot = mix(sweep(0.12, 85, 35, 'sin', noise=0.25), lowpass(sweep(0.09, 180, 60, noise=1), 0.1))
    for i, v in enumerate(foot):
        j = int(at * R) + i
        if j < len(pursuit): pursuit[j] += v * 0.65
breath = lowpass([random.uniform(-1, 1) for _ in pursuit], 0.04)
for i in range(len(pursuit)):
    t = i / R
    pursuit[i] += breath[i] * math.sin(math.pi * t / 1.6) ** 2 * 0.7
write('sfx-pursuit', pursuit, 0.46)
