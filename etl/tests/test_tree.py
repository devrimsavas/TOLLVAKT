import copy

import pytest

from tests.fixtures import EN_TREE, NB_TREE
from tollvakt_etl.norway.tree import TreeMismatchError, build_tree


def test_builds_one_node_per_element_with_both_languages():
    nodes = build_tree(NB_TREE, EN_TREE)

    assert [n.node_type for n in nodes] == [
        "section", "chapter", "heading", "subheading", "commodity",
        "subheading", "commodity", "subchapter", "heading", "commodity",
    ]
    leaf = next(n for n in nodes if n.code == "01012902")
    assert leaf.description_nb == "av vekt under 133 kg"
    assert leaf.description_en == "Of a weight less than 133 kg"
    assert leaf.hs_code == "010129"
    assert leaf.agri_reduction is True


def test_parents_come_first_and_paths_are_unique():
    nodes = build_tree(NB_TREE, EN_TREE)
    seen = set()
    for node in nodes:
        assert node.parent_id is None or node.parent_id in seen
        seen.add(node.id)
    paths = [n.path for n in nodes]
    assert len(paths) == len(set(paths))
    assert "01/01/0101/01012~0/010129~1/01012902" in paths


def test_keeps_unnumbered_rows_with_their_parent_text():
    nodes = build_tree(NB_TREE, EN_TREE)
    other = next(n for n in nodes if n.description_nb == "andre:")
    assert other.code is None
    assert other.node_type == "subheading"


def test_removes_duplicate_references():
    nodes = build_tree(NB_TREE, EN_TREE)
    assert next(n for n in nodes if n.code == "01012100").references == ["TKV 031"]


def test_fails_when_the_trees_have_different_shapes():
    en = copy.deepcopy(EN_TREE)
    en["sections"][0]["chapters"][0]["divisions"].pop()

    with pytest.raises(TreeMismatchError, match="children"):
        build_tree(NB_TREE, en)


def test_fails_when_ids_differ():
    en = copy.deepcopy(EN_TREE)
    en["sections"][0]["chapters"][0]["divisions"][0]["id"] = "9999"

    with pytest.raises(TreeMismatchError, match="Different ids"):
        build_tree(NB_TREE, en)


def test_builds_search_texts_from_the_whole_path():
    nodes = build_tree(NB_TREE, EN_TREE)
    leaf = next(n for n in nodes if n.code == "01012902")

    assert leaf.search_text_nb == (
        "Levende dyr; animalske produkter > Levende dyr > "
        "Hester, esler, muldyr og mulesler, levende. > hester > andre > av vekt under 133 kg"
    )
    assert leaf.search_text_en.endswith("Horses > Other > Of a weight less than 133 kg")
    # The node's own text keeps the tariff's colon
    horses = next(n for n in nodes if n.description_en == "Horses :")
    assert horses.search_text_en.endswith("> Horses")
