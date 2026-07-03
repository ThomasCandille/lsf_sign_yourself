import re

_VULGAR_FR = {
    "putain", "merde", "connard", "connasse", "salope", "enculé", "enculer",
    "pute", "bordel", "bâtard", "batard", "fdp", "nique", "niquer", "con",
    "conne", "chier", "chieur", "chiasse", "couille", "couilles", "bite",
    "queue", "cul", "fesse", "fesses", "baiser", "baisé", "branler",
    "branleur", "branlette", "pénis", "vagin", "phallus", "anus", "trou",
    "tapette", "pédé", "pede", "négro", "negro", "bamboula", "youpin",
    "youpine", "tocard", "abruti", "idiot", "imbécile", "crétin",
}

_NORMALIZE = str.maketrans("àáâãäåèéêëìíîïòóôõöùúûüýÿçñ",
                             "aaaaaaeeeeiiiioooooùuuuyyçn")


def _normalize(text: str) -> str:
    return text.lower().translate(_NORMALIZE)


def is_vulgar(pseudo: str) -> bool:
    normalized = _normalize(pseudo)
    words = re.split(r"[\s_\-\.]+", normalized)
    return any(w in _VULGAR_FR for w in words)
