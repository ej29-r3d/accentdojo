"""Topics and phrases from content/topics.json, plus phrases the user types."""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path

from . import g2p

LEVELS = ("beginner", "intermediate", "advanced")
GROUPS = ("situations", "pairs", "sounds")
CONTENT_FILE = Path(os.environ.get("KOLE_CONTENT", Path(__file__).resolve().parents[2] / "content" / "topics.json"))

#: Typed phrases above this many words are refused: the scorer was trained on 2-12 word sentences.
MAX_CUSTOM_WORDS = 15
MAX_CUSTOM_CHARS = 140
CUSTOM_PREFIX = "custom."


class InvalidPhrase(ValueError):
    pass


@dataclass(frozen=True)
class Phrase:
    id: str
    text: str
    level: str | None
    topic_id: str | None
    words: tuple[g2p.DisplayWord, ...]

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "text": self.text,
            "level": self.level,
            "topicId": self.topic_id,
            "words": [{"text": w.text, "phonemes": w.phonemes} for w in self.words],
        }


@dataclass(frozen=True)
class Topic:
    id: str
    name: str
    blurb: str
    group: str
    #: IPA symbol shown beside a sound topic; None elsewhere.
    symbol: str | None
    phrases: dict[str, tuple[Phrase, ...]]

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "group": self.group,
            "name": self.name,
            "blurb": self.blurb,
            "symbol": self.symbol,
            "counts": {level: len(self.phrases[level]) for level in LEVELS},
        }


class Content:
    def __init__(self, path: Path = CONTENT_FILE):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        self.topics: dict[str, Topic] = {}
        self.phrases: dict[str, Phrase] = {}
        for t in data["topics"]:
            by_level = {}
            for level in LEVELS:
                items = []
                for i, text in enumerate(t["phrases"].get(level, [])):
                    p = Phrase(f"{t['id']}.{level}.{i}", text, level, t["id"], tuple(g2p.words_of(text)))
                    items.append(p)
                    self.phrases[p.id] = p
                by_level[level] = tuple(items)
            self.topics[t["id"]] = Topic(t["id"], t["name"], t["blurb"], t.get("group", "situations"), t.get("symbol"), by_level)

    def phrase(self, phrase_id: str) -> Phrase | None:
        if phrase_id.startswith(CUSTOM_PREFIX):
            try:
                text = base64.urlsafe_b64decode(phrase_id[len(CUSTOM_PREFIX):] + "==").decode("utf-8")
                return prepare(text)
            except (ValueError, UnicodeDecodeError):
                return None
        return self.phrases.get(phrase_id)

    def by_level(self, level: str) -> list[Phrase]:
        return [p for t in self.topics.values() for p in t.phrases[level]]


def prepare(text: str) -> Phrase:
    """A typed phrase. Its id encodes the text, so it is stable and needs no server state."""
    clean = " ".join(text.split())
    if not clean:
        raise InvalidPhrase("Type a phrase first.")
    if len(clean) > MAX_CUSTOM_CHARS:
        raise InvalidPhrase(f"Keep it under {MAX_CUSTOM_CHARS} characters.")
    words = g2p.words_of(clean)
    if not words:
        raise InvalidPhrase("Type at least one word.")
    if len(words) > MAX_CUSTOM_WORDS:
        raise InvalidPhrase(f"Keep it to {MAX_CUSTOM_WORDS} words or fewer.")
    pid = CUSTOM_PREFIX + base64.urlsafe_b64encode(clean.encode("utf-8")).decode("ascii").rstrip("=")
    return Phrase(pid, clean, None, None, tuple(words))
