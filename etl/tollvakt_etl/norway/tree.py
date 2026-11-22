"""Turns the Norwegian and English tariff trees into tariff_nodes rows.

Both files have the same shape, so they are walked side by side and every
element becomes one row with both descriptions. If the shapes differ, the
import stops: the two languages would no longer describe the same element.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from tollvakt_etl.parsing import clean_text


class TreeMismatchError(ValueError):
    """The Norwegian and English trees do not have the same shape."""


# Source type (Norwegian, English) -> node_type in the database
NODE_TYPES = {
    ("avsnitt", "section"): "section",
    ("kapittel", "chapter"): "chapter",
    ("underkapittel", "subchapter"): "subchapter",
    ("posisjon", "heading"): "heading",
    ("underposisjon", "subsubheading"): "subheading",
    ("vare", "commodity"): "commodity",
}

# Where the children are, per language
CHILD_KEYS_NB = ("kapitler", "inndelinger", "posisjoner", "oppdelinger")
CHILD_KEYS_EN = ("chapters", "divisions", "headings")


@dataclass
class TariffNode:
    id: int
    parent_id: int | None
    node_type: str
    code: str | None
    hs_code: str | None
    description_nb: str | None
    description_en: str | None
    agri_reduction: bool
    sort_order: int
    depth: int
    path: str
    # The texts of every node from the section down to this one, for search
    search_text_nb: str | None = None
    search_text_en: str | None = None
    # The text embedded for semantic search: the node's own text first, then
    # the levels above it up to the chapter (see _embedding_path)
    embedding_text_nb: str | None = None
    embedding_text_en: str | None = None
    references: list[str] = field(default_factory=list)


def _children(node: dict[str, Any], keys: tuple[str, ...]) -> list[dict[str, Any]]:
    children: list[dict[str, Any]] = []
    for key in keys:
        children.extend(node.get(key) or [])
    return children


def _join_path(parent_text: str | None, own: str | None) -> str | None:
    # The tariff ends texts that have sub-items with a colon ("Other, frozen :");
    # in a path the ">" already says that
    if own:
        own = own.rstrip(" :") or None
    parts = [part for part in (parent_text, own) if part]
    return " > ".join(parts) or None


def _embedding_path(parent_text: str | None, own: str | None, depth: int) -> str | None:
    """Own text first, then the levels above, nearest first, up to the chapter.

    A code's own text is often short ("koffeinholdig", "ellers"); in a path
    from the section down, the long general titles above it decide the
    vector and the part that tells codes apart gets lost. Putting the own
    text first and leaving out the section title keeps it in front.
    """
    if depth == 0:
        return None  # section titles are left out
    if own:
        own = own.rstrip(" :") or None
    parts = [part for part in (own, parent_text) if part]
    return " < ".join(parts) or None


def _where(path: str) -> str:
    return path or "(root)"


def build_tree(nb_root: dict[str, Any], en_root: dict[str, Any]) -> list[TariffNode]:
    """Walks both trees and returns the nodes in official order.

    Ids are given here (1, 2, 3 ...) so parents can be referenced before
    anything is written to the database.
    """
    nodes: list[TariffNode] = []

    def visit(
        nb: dict[str, Any],
        en: dict[str, Any],
        parent: TariffNode | None,
        sort_order: int,
    ) -> None:
        parent_path = parent.path if parent else ""
        key = (nb.get("type"), en.get("type"))
        node_type = NODE_TYPES.get(key)  # type: ignore[arg-type]
        if node_type is None:
            raise TreeMismatchError(
                f"Unknown or mismatched types {key} under {_where(parent_path)}"
            )

        code = nb.get("id")
        if code != en.get("id"):
            raise TreeMismatchError(
                f"Different ids {code!r} / {en.get('id')!r} under {_where(parent_path)}"
            )
        hs_code = nb.get("hsNummer")
        if hs_code != en.get("hsNumber"):
            raise TreeMismatchError(
                f"Different HS codes {hs_code!r} / {en.get('hsNumber')!r} under {_where(parent_path)}"
            )

        # Unnumbered rows (e.g. "andre:") get their HS code and position, so
        # every path is unique
        segment = code or f"{hs_code or '-'}~{sort_order}"
        path = f"{parent_path}/{segment}" if parent_path else segment

        node = TariffNode(
            id=len(nodes) + 1,
            parent_id=parent.id if parent else None,
            node_type=node_type,
            code=code,
            hs_code=hs_code,
            description_nb=clean_text(nb.get("vareslag") or nb.get("beskrivelse")),
            description_en=clean_text(en.get("item") or en.get("description")),
            agri_reduction=bool(nb.get("blv") or en.get("pap")),
            sort_order=sort_order,
            depth=parent.depth + 1 if parent else 0,
            path=path,
            references=list(dict.fromkeys(nb.get("henvisninger") or [])),
        )
        node.search_text_nb = _join_path(parent.search_text_nb if parent else None, node.description_nb)
        node.search_text_en = _join_path(parent.search_text_en if parent else None, node.description_en)
        node.embedding_text_nb = _embedding_path(
            parent.embedding_text_nb if parent else None, node.description_nb, node.depth
        )
        node.embedding_text_en = _embedding_path(
            parent.embedding_text_en if parent else None, node.description_en, node.depth
        )
        nodes.append(node)

        nb_children = _children(nb, CHILD_KEYS_NB)
        en_children = _children(en, CHILD_KEYS_EN)
        if len(nb_children) != len(en_children):
            raise TreeMismatchError(
                f"{path}: {len(nb_children)} Norwegian children, {len(en_children)} English"
            )
        for index, (nb_child, en_child) in enumerate(zip(nb_children, en_children)):
            visit(nb_child, en_child, node, index)

    nb_sections = nb_root.get("avsnitt") or []
    en_sections = en_root.get("sections") or []
    if len(nb_sections) != len(en_sections):
        raise TreeMismatchError(
            f"{len(nb_sections)} Norwegian sections, {len(en_sections)} English"
        )
    for index, (nb_section, en_section) in enumerate(zip(nb_sections, en_sections)):
        visit(nb_section, en_section, None, index)

    return nodes
