"""Original notification tones, synthesized from sine waves, licensed under this project's MIT license."""
from pathlib import Path
import math,struct,wave
root=Path(__file__).resolve().parent/'sounds';root.mkdir(exist_ok=True)
rate=22050
patterns={'completion':[(0,523.25),(.3,659.25),(.6,783.99)],'refresh':[(0,392),(.25,523.25),(.5,659.25),(1.1,392),(1.35,523.25),(1.6,783.99)]}
for name,notes in patterns.items():
    samples=[]
    for index in range(rate*5):
        t=index/rate;v=0
        for onset,hz in notes:
            age=t-onset
            if 0<=age<.7:
                envelope=min(1,age/.025)*math.exp(-age*6)*(1-age/.7)
                v+=.18*envelope*(math.sin(2*math.pi*hz*age)+.12*math.sin(4*math.pi*hz*age))
        samples.append(struct.pack('<h',round(max(-.7,min(.7,v))*32767)))
    with wave.open(str(root/(name+'.wav')),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(b''.join(samples))
print('Generated two original PCM WAV tones; no playback performed')
