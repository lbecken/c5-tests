"""What it takes to read one language.

A :class:`LanguagePack` gathers everything language-specific in one immutable
object: which characters are letters, which dictionary to consult and in what
notation, how words decompose, which voices may speak it, and which code the
engine wants. Nothing else in the application branches on language — it asks
the pack.

Adding a language means adding a pack and registering it. It does not mean
touching the tokenizer, the cache, the job runner or the API.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from reader_tts.domain.enums import LanguageCode, PhonemeNotation
from reader_tts.domain.models import VoiceConfig
from reader_tts.text.characters import CharacterPolicy


@dataclass(frozen=True, slots=True)
class DictionaryConfig:
    """Where a language's pronunciation dictionary lives and how to read it."""

    name: str
    #: Directory under the configured data directory.
    directory_name: str
    filename: str
    #: Which loader parses the file.
    loader: str  # "cmudict" | "ipadict"
    notation: PhonemeNotation

    def directory(self, data_dir: Path) -> Path:
        """Resolve the dictionary directory against the data directory."""
        return data_dir / self.directory_name


@dataclass(frozen=True, slots=True)
class LanguagePack:
    """Everything the reader needs in order to read one language."""

    code: LanguageCode
    display_name: str
    #: The code the speech engine uses; Kokoro wants a single letter.
    engine_language_code: str
    dictionary: DictionaryConfig
    character_policy: CharacterPolicy
    voices: tuple[VoiceConfig, ...]
    #: Sample text offered in the interface.
    sample_text: str
    #: Elided clitics, uppercase and including the apostrophe, mapped to their
    #: pronunciation. Empty for languages without elision.
    elision_clitics: dict[str, tuple[str, ...]] = field(default_factory=dict)
    #: Whether a word may be resolved by splitting it at an apostrophe.
    supports_elision: bool = False
    #: Orthographic variants folded before a second lookup, uppercase. French
    #: keyboards often produce 'oeuf' where the dictionary holds 'œuf'.
    spelling_variants: tuple[tuple[str, str], ...] = ()

    @property
    def notation(self) -> PhonemeNotation:
        """The notation this language writes pronunciations in."""
        return self.dictionary.notation

    @property
    def voice_ids(self) -> tuple[str, ...]:
        """Identifiers of the voices that may speak this language."""
        return tuple(voice.id for voice in self.voices)

    @property
    def default_voice_id(self) -> str:
        """The voice used when the caller names none.

        A language with a single voice therefore selects it automatically.
        """
        return self.voices[0].id

    def has_voice(self, voice_id: str) -> bool:
        """Whether *voice_id* may speak this language."""
        return voice_id in self.voice_ids


#: Languages whose speakers expect a space before some punctuation. French puts
#: a thin space before ; : ! ?, which normalization turns into a plain space;
#: synthesis text preparation removes it again so the engine sees ordinary
#: punctuation.
SPACED_PUNCTUATION_LANGUAGES: Final = frozenset({LanguageCode.FR_FR})
