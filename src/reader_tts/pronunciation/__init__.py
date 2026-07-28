"""Pronunciation dictionary, overrides, ambiguity reporting and resolution."""

from reader_tts.pronunciation.ambiguity import AmbiguousWord, collect_ambiguities
from reader_tts.pronunciation.dictionary import PronunciationDictionary
from reader_tts.pronunciation.overrides import OverrideRepository
from reader_tts.pronunciation.resolver import PronunciationResolver

__all__ = [
    "AmbiguousWord",
    "OverrideRepository",
    "PronunciationDictionary",
    "PronunciationResolver",
    "collect_ambiguities",
]
