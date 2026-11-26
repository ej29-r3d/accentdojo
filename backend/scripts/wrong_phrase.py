"""How often is a reading of a different phrase refused as off_phrase?

Plays the reference voice's reading of one built-in phrase against the text of another,
through a running server:

    .venv/bin/python scripts/wrong_phrase.py [http://127.0.0.1:8000] [n_pairs]

Needs the server to run without a password (or on localhost before one is set).
"""
import collections
import io
import json
import random
import sys
import urllib.request
import uuid

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 40


def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return r.read()


def score(phrase_id, wav):
    boundary = uuid.uuid4().hex
    body = io.BytesIO()
    body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="a.wav"\r\n'
               f"Content-Type: audio/wav\r\n\r\n".encode())
    body.write(wav)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(f"{BASE}/api/phrases/{phrase_id}/score", data=body.getvalue(),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


random.seed(7)
phrases = []
for topic in random.sample(json.loads(get("/api/topics")), 8):
    for level in ("beginner", "intermediate", "advanced"):
        phrases += json.loads(get(f"/api/topics/{topic['id']}/phrases?level={level}"))[:2]
phrases = [p for p in phrases if len(p["words"]) >= 3]
random.shuffle(phrases)
phrases = phrases[:N]

outcomes = collections.Counter()
for i, said in enumerate(phrases):
    shown = phrases[(i + 7) % len(phrases)]
    ref = json.loads(get(f"/api/phrases/{said['id']}/reference"))
    result = score(shown["id"], get(ref["url"]))
    if result["status"] == "scored":
        outcomes[f"scored {result['score']}"] += 1
        print(f"missed: said {said['text']!r} for {shown['text']!r} -> {result['score']}")
    else:
        outcomes[result["reason"]] += 1
print(dict(outcomes))
