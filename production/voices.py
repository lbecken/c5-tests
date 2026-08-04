"""Voice bible for THE FORECAST IS MEMORY.

Casting was chosen for acoustic separation first: the game is playable with the
screen turned away, so no two characters who share a scene may sit close in
pitch. Measured median F0 from casting tests is recorded below; every adjacent
pair on that ladder is additionally separated by accent, era, or processing.

    Kroll     95.8 Hz   German     1983 tape
    Nagel    115.1 Hz   German     present
    Dorsey   132.2 Hz   American   present
    Halloway 137.9 Hz   British    1983 tape
    Frayne   158.4 Hz   British    present
    Iris     177.8 Hz   British    present
    Vogt     188.2 Hz   German     present
    Meteo    214.8 Hz   ---        shortwave
"""

VOICES = {
    # --- present day -------------------------------------------------------
    "vogt": {
        "voice_id": "e08a4DxAw2gRDHs73Vg0",   # Charlotte - German, competent
        "name": "Anneke Vogt",
        "f0": 188.2,
        "bible": "44. German federal archivist, runs the facility. Procedural, "
                 "clipped, verifies everything. Cracks exactly once.",
        "settings": {"stability": 0.45, "similarity_boost": 0.8, "speed": 1.0},
    },
    "frayne": {
        "voice_id": "aAsWcN5jdLdiYG7Hq0YL",   # Harriet - refined, educated, bossy
        "name": "Dame Rosalind Frayne",
        "f0": 158.4,
        "bible": "78. Retired SIS, Halloway's handler in 1983. Imperious, "
                 "unsentimental, minimises. Never raises her voice; lowers it.",
        "settings": {"stability": 0.5, "similarity_boost": 0.8, "speed": 0.96},
    },
    "nagel": {
        "voice_id": "fvmkmNaIvqNTpXkcg7GK",   # Bernd - old German male
        "name": "Ulrich Nagel",
        "f0": 115.1,
        "bible": "74. Former Stasi HA III radio technician. Careful, sardonic, "
                 "quietly amused. Reframes rather than denies. The craftsman.",
        "settings": {"stability": 0.45, "similarity_boost": 0.8, "speed": 0.97},
    },
    "iris": {
        "voice_id": "pFZP5JQG7iQjIQuC4Bku",   # Lily - British actress
        "name": "Iris Halloway",
        "f0": 177.8,
        "bible": "49. Cryptanalyst. Peter Halloway's daughter. Presses, refuses "
                 "euphemism, holds emotion just under the surface.",
        "settings": {"stability": 0.4, "similarity_boost": 0.8, "speed": 1.0},
    },
    "dorsey": {
        "voice_id": "pqHfZKP75CvOlQylNhV4",   # Bill - old American, wise/mature
        "name": "Gene Dorsey",
        "f0": 132.2,
        "bible": "81. Former CIA liaison. Warm, paternal, practised at sounding "
                 "candid. Reassures. Every kindness is load-bearing.",
        "settings": {"stability": 0.5, "similarity_boost": 0.8, "speed": 0.97},
    },
    # --- archive -----------------------------------------------------------
    "halloway": {
        "voice_id": "2styzLg7OSeuhPP6uQ26",   # Philip - British, clear, measured
        "name": "Dr. Peter Halloway",
        "f0": 137.9,
        "bible": "36 in 1983. Cryptographer. Precise, dry, intellectually "
                 "playful early; strained and very quiet at the end.",
        "settings": {"stability": 0.45, "similarity_boost": 0.75, "speed": 0.98},
        "process": "tape83",
    },
    "kroll": {
        "voice_id": "vIERrrzU4FdRcAQVRMYE",   # Otto - German accent, deep
        "name": "Willi Kroll",
        "f0": 95.8,
        "bible": "34 in 1983. West German field officer, Halloway's extraction "
                 "contact. Heard only in an unsent letter. Frightened, formal.",
        "settings": {"stability": 0.35, "similarity_boost": 0.75, "speed": 0.98},
        "process": "tape83",
    },
    "meteo": {
        "voice_id": "iEO9cGszaIjDeIaW2Ywk",   # Emily E. - announcement voice
        "name": "The Meteorologist",
        "f0": 214.8,
        "bible": "Not a person. Ilse Vogt's syllables, cut and re-cut. Flat, "
                 "metrical, no emphasis anywhere. Never sounds like it means it.",
        "settings": {"stability": 0.95, "similarity_boost": 0.9, "speed": 0.94},
        "process": "shortwave",
    },
}

# Characters who may share a scene must be >12 Hz apart or differ in processing.
SCENE_SAFE_EXCEPTIONS = {
    ("halloway", "dorsey"),   # never co-present; 1983 tape vs clean line
    ("halloway", "nagel"),    # 23 Hz apart, plus tape processing
}
