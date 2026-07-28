"""Text processing: character policy, tokenization, segmentation, validation."""

from reader_tts.text.characters import canonicalize_source, normalize_characters
from reader_tts.text.paragraphs import split_paragraphs
from reader_tts.text.sentences import split_sentences
from reader_tts.text.tokenizer import tokenize
from reader_tts.text.validator import AnalyzedText, WordResolver, WordSupport, analyze

__all__ = [
    "AnalyzedText",
    "WordResolver",
    "WordSupport",
    "analyze",
    "canonicalize_source",
    "normalize_characters",
    "split_paragraphs",
    "split_sentences",
    "tokenize",
]
