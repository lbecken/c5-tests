"""The bundled language packs.

Three languages share one 82M speech model: US English, British English and
French. English is validated against CMUdict in ARPAbet; French against
ipa-dict in IPA.
"""

from __future__ import annotations

from typing import Final

from reader_tts.config import defaults
from reader_tts.domain.enums import LanguageCode, PhonemeNotation
from reader_tts.domain.models import VoiceConfig
from reader_tts.languages.base import DictionaryConfig, LanguagePack
from reader_tts.text.characters import DEFAULT_POLICY, FRENCH_POLICY

# --- Dictionaries ---------------------------------------------------------------

CMUDICT: Final = DictionaryConfig(
    name="cmudict",
    directory_name="cmudict",
    filename="cmudict.dict",
    loader="cmudict",
    notation=PhonemeNotation.ARPABET,
)

IPADICT_FR: Final = DictionaryConfig(
    name="ipa-dict-fr",
    directory_name="ipadict-fr",
    filename="fr_FR.txt",
    loader="ipadict",
    notation=PhonemeNotation.IPA,
)

# --- Voices -----------------------------------------------------------------------


def _voice(
    identifier: str, display: str, language: LanguageCode, gender: str | None
) -> VoiceConfig:
    return VoiceConfig(
        id=identifier,
        display_name=display,
        language_code=language.value,
        gender_label=gender,
        model_voice_name=identifier,
        default_speed=defaults.DEFAULT_SPEED,
    )


US_ENGLISH_VOICES: Final = (
    _voice("af_heart", "Heart (US female)", LanguageCode.EN_US, "female"),
    _voice("af_bella", "Bella (US female)", LanguageCode.EN_US, "female"),
    _voice("am_michael", "Michael (US male)", LanguageCode.EN_US, "male"),
    _voice("am_fenrir", "Fenrir (US male)", LanguageCode.EN_US, "male"),
)

BRITISH_ENGLISH_VOICES: Final = (
    _voice("bf_emma", "Emma (British female)", LanguageCode.EN_GB, "female"),
    _voice("bm_george", "George (British male)", LanguageCode.EN_GB, "male"),
)

#: Kokoro ships exactly one French voice, so French selects it automatically.
FRENCH_VOICES: Final = (_voice("ff_siwis", "Siwis (French female)", LanguageCode.FR_FR, "female"),)

# --- Elision ------------------------------------------------------------------------

#: French clitics that elide before a vowel or mute h, with their pronunciation.
#: A word such as ``l'homme`` is not a dictionary entry, so it is resolved as a
#: clitic plus the word that follows. Words that merely contain an apostrophe,
#: like ``aujourd'hui``, are ordinary dictionary entries and are matched whole
#: before any decomposition is attempted.
FRENCH_ELISION_CLITICS: Final[dict[str, tuple[str, ...]]] = {
    "C'": ("s",),
    "D'": ("d",),
    "J'": ("ʒ",),
    "L'": ("l",),
    "M'": ("m",),
    "N'": ("n",),
    "S'": ("s",),
    "T'": ("t",),
    "QU'": ("k",),
    "JUSQU'": ("ʒ", "y", "s", "k"),
    "LORSQU'": ("l", "ɔ", "ʁ", "s", "k"),
    "PUISQU'": ("p", "ɥ", "i", "s", "k"),
    "QUOIQU'": ("k", "w", "a", "k"),
}

# --- Packs -------------------------------------------------------------------------------

US_ENGLISH: Final = LanguagePack(
    code=LanguageCode.EN_US,
    display_name="English (United States)",
    engine_language_code="a",
    dictionary=CMUDICT,
    character_policy=DEFAULT_POLICY,
    voices=US_ENGLISH_VOICES,
    sample_text=(
        "The cat sat on the mat. The wind moved through the trees.\n\n"
        "Did you close the door? I read the book yesterday, and I read books "
        "every day.\n\n"
        '"Please record the record," she said, quietly, without turning around. '
        "The lead pipe was heavy; she set it down and waited for the wind to drop."
    ),
)

BRITISH_ENGLISH: Final = LanguagePack(
    code=LanguageCode.EN_GB,
    display_name="English (United Kingdom)",
    engine_language_code="b",
    # CMUdict records North American pronunciations. It is used here for
    # coverage and ambiguity reporting; the British voice supplies the accent.
    dictionary=CMUDICT,
    character_policy=DEFAULT_POLICY,
    voices=BRITISH_ENGLISH_VOICES,
    sample_text=(
        "The cat sat on the mat. The wind moved through the trees.\n\n"
        "Did you close the door? I read the book yesterday, and I read books "
        "every day."
    ),
)

FRENCH: Final = LanguagePack(
    code=LanguageCode.FR_FR,
    display_name="Français (France)",
    engine_language_code="f",
    dictionary=IPADICT_FR,
    character_policy=FRENCH_POLICY,
    voices=FRENCH_VOICES,
    elision_clitics=FRENCH_ELISION_CLITICS,
    supports_elision=True,
    # The dictionary uses the ligatures, but text typed on an ordinary keyboard
    # usually does not. Folding lets 'oeufs' find 'œufs'.
    spelling_variants=(("OE", "Œ"), ("AE", "Æ")),
    sample_text=(
        "Le vent soufflait doucement à travers les arbres. "
        "Où avez-vous mis les clés ?\n\n"
        "J'ai lu le livre hier, et je lis des livres tous les jours. "
        "L'homme qu'il attendait n'est pas venu.\n\n"
        "« Fermez la porte, s'il vous plaît », dit-elle calmement. "
        "Le chat dormait près du feu, et personne ne bougeait."
    ),
)

ALL_PACKS: Final = (US_ENGLISH, BRITISH_ENGLISH, FRENCH)
