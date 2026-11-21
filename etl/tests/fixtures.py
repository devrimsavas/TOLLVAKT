"""Small, hand-made versions of Tolletaten's files, in their real shape."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

NB_TREE: dict[str, Any] = {
    "versjon": "1.5",
    "avsnitt": [
        {
            "type": "avsnitt",
            "id": "01",
            "beskrivelse": "Levende dyr; animalske produkter",
            "kapitler": [
                {
                    "type": "kapittel",
                    "id": "01",
                    "beskrivelse": "Levende dyr",
                    "inndelinger": [
                        {
                            "type": "posisjon",
                            "id": "0101",
                            "beskrivelse": "Hester, esler, muldyr og mulesler, levende.",
                            "henvisninger": ["TKV 007"],
                            "oppdelinger": [
                                {
                                    "type": "underposisjon",
                                    "beskrivelse": "hester:",
                                    "hsNummer": "01012",
                                    "oppdelinger": [
                                        {
                                            "type": "vare",
                                            "id": "01012100",
                                            "hsNummer": "010121",
                                            "vareslag": "til avl",
                                            "blv": False,
                                            "henvisninger": ["TKV 031", "TKV 031"],
                                        },
                                        {
                                            "type": "underposisjon",
                                            "beskrivelse": "andre:",
                                            "hsNummer": "010129",
                                            "oppdelinger": [
                                                {
                                                    "type": "vare",
                                                    "id": "01012902",
                                                    "hsNummer": "010129",
                                                    "vareslag": "av vekt under 133 kg",
                                                    "blv": True,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            "type": "underkapittel",
                            "id": "01A",
                            "beskrivelse": "Andre dyr",
                            "posisjoner": [
                                {
                                    "type": "posisjon",
                                    "id": "0106",
                                    "beskrivelse": "Andre levende dyr.",
                                    "oppdelinger": [
                                        {
                                            "type": "vare",
                                            "id": "01061100",
                                            "hsNummer": "010611",
                                            "vareslag": "primater",
                                            "blv": False,
                                        }
                                    ],
                                }
                            ],
                        },
                    ],
                }
            ],
        }
    ],
}

EN_TREE: dict[str, Any] = {
    "version": "1.5",
    "sections": [
        {
            "type": "section",
            "id": "01",
            "description": "Live animals; animal products",
            "chapters": [
                {
                    "type": "chapter",
                    "id": "01",
                    "description": "Live animals",
                    "divisions": [
                        {
                            "type": "heading",
                            "id": "0101",
                            "description": "Live horses, asses, mules and hinnies.",
                            "references": ["TKV 007"],
                            "divisions": [
                                {
                                    "type": "subsubheading",
                                    "description": " Horses : ",
                                    "hsNumber": "01012",
                                    "divisions": [
                                        {
                                            "type": "commodity",
                                            "id": "01012100",
                                            "hsNumber": "010121",
                                            "item": " Pure-bred breeding animals ",
                                            "pap": False,
                                        },
                                        {
                                            "type": "subsubheading",
                                            "description": " Other : ",
                                            "hsNumber": "010129",
                                            "divisions": [
                                                {
                                                    "type": "commodity",
                                                    "id": "01012902",
                                                    "hsNumber": "010129",
                                                    "item": " Of a weight less than 133 kg ",
                                                    "pap": True,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            "type": "subchapter",
                            "id": "01A",
                            "description": "Other animals",
                            "headings": [
                                {
                                    "type": "heading",
                                    "id": "0106",
                                    "description": "Other live animals.",
                                    "divisions": [
                                        {
                                            "type": "commodity",
                                            "id": "01061100",
                                            "hsNumber": "010611",
                                            "item": "Primates",
                                            "pap": False,
                                        }
                                    ],
                                }
                            ],
                        },
                    ],
                }
            ],
        }
    ],
}

VARENUMMER = {
    "versjon": "1.0",
    "varenummer": [
        {"id": "00000011", "enhet": "KG", "enhetBeskrivelse": "Kilogram", "fomdato": "1988-06-24", "tomdato": "", "fomperiode": "0101", "tomperiode": "1231"},
        {"id": "01012100", "enhet": "STK", "enhetBeskrivelse": "Stykk", "fomdato": "1988-01-01", "tomdato": "", "fomperiode": "0101", "tomperiode": "1231"},
        {"id": "01012902", "enhet": "STK", "enhetBeskrivelse": "Stykk", "fomdato": "1988-01-01", "tomdato": "", "fomperiode": "0101", "tomperiode": "1231",
         "klassifiseringer": [{"kode": "NA", "klassifiseringBeskrivelse": "Næringsmiddel", "fomdato": "2020-01-01", "tomdato": ""}]},
        {"id": "01061100", "enhet": "STK", "enhetBeskrivelse": "Stykk", "fomdato": "1988-01-01", "tomdato": "2030-12-31", "fomperiode": "0101", "tomperiode": "1231"},
    ],
}

LANDGRUPPE = {
    "versjon": "1.1",
    "landgrupper": [
        {"landgruppekode": "TALL", "landgruppenavn": "Toll fra alle land (ordinær toll)", "preferansekode": "N", "fomdato": "1990-01-01", "tomdato": ""},
        {"landgruppekode": "TTYR", "landgruppenavn": "Toll fra Tyrkia", "preferansekode": "P", "fomdato": "1990-01-01", "tomdato": ""},
        {"landgruppekode": "TEF", "landgruppenavn": "Toll fra EU- land", "preferansekode": "B", "fomdato": "1990-01-01", "tomdato": ""},
    ],
}

MEDLEMSLAND = {
    "versjon": "1.1",
    "medlemsland": [
        {"landkode": "TR", "landnavn": "Tyrkia", "landgrupper": [{"landgruppekode": "TTYR", "fomdato": "1992-04-17", "tomdato": ""}]},
        {"landkode": "DE", "landnavn": "Tyskland", "landgrupper": [{"landgruppekode": "TEF", "fomdato": "1990-01-01", "tomdato": ""}]},
    ],
}

HENVISNING = {
    "versjon": "1.0",
    "henvisninger": [
        {"kode": "TKV 007", "uttrykk": "Tollkvote", "definisjon": "<p>Kvote</p>"},
        {"kode": "TKV 031", "uttrykk": "Tollkvote MERCOSUR", "definisjon": "<p>Hester</p>"},
    ],
}

REFERENCE = {
    "version": "1.0",
    "references": [
        {"code": "TKV 007", "expression": "Quota", "definition": "<p>Quota</p>"},
        {"code": "TKV 031", "expression": "Quota MERCOSUR", "definition": "<p>Horses</p>"},
        {"code": "EN 1", "expression": "English only", "definition": "<p>Only in English</p>"},
    ],
}

FILES = {
    "tolltariffstruktur": NB_TREE,
    "customstariffstructure": EN_TREE,
    "varenummer": VARENUMMER,
    "landgruppe": LANDGRUPPE,
    "medlemsland": MEDLEMSLAND,
    "henvisning": HENVISNING,
    "reference": REFERENCE,
}


def write_folder(folder: Path, overrides: dict[str, Any] | None = None) -> Path:
    """Writes the fixture files (with optional replacements) to a folder."""
    folder.mkdir(parents=True, exist_ok=True)
    files = copy.deepcopy(FILES)
    files.update(overrides or {})
    for name, data in files.items():
        (folder / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return folder
