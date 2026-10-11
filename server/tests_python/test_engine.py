import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine import create_game, player_view

SEATS = [
    {"player_id": "user:1", "name": "Zeg"},
    {"player_id": "user:2", "name": "Bob"},
    {"player_id": "guest:abc", "name": "Ann"},
]
DECK_SETTINGS = {"gold": {"1": 5, "2": 5, "3": 5}, "resource": {"1": 5, "2": 4, "3": 2, "4": 2}}
NOW = 1_700_000_000_000


def views_for(game):
    return [player_view(game, seat) for seat in range(len(SEATS))]


def all_cards_in(view):
    """Every card object anywhere in a Player View."""
    found = []

    def walk(node):
        if isinstance(node, dict):
            if "type" in node and "value" in node and "isSpecial" in node:
                found.append(node)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(view)
    return found


def test_the_same_seed_gives_the_same_game():
    a = create_game(SEATS, DECK_SETTINGS, seed=42, now=NOW)
    b = create_game(SEATS, DECK_SETTINGS, seed=42, now=NOW)
    assert views_for(a) == views_for(b)


def test_different_seeds_give_different_games():
    a = create_game(SEATS, DECK_SETTINGS, seed=1, now=NOW)
    b = create_game(SEATS, DECK_SETTINGS, seed=2, now=NOW)
    assert views_for(a) != views_for(b)


def test_dice_are_rolled_by_the_engine_for_each_resource():
    view = player_view(create_game(SEATS, DECK_SETTINGS, seed=7, now=NOW), 0)
    assert [d["resource_type"] for d in view["dice"]] == ["Art", "Herbs", "Military", "Religion", "Science"]
    assert all(2 <= d["value"] <= 4 for d in view["dice"])


def test_the_game_starts_in_the_donation_phase_with_the_first_seat_donating():
    view = player_view(create_game(SEATS, DECK_SETTINGS, seed=7, now=NOW), 1)
    assert view["phase"] == "donation"
    assert view["current_seat"] == 0
    assert view["you"] == 1
    assert [s["name"] for s in view["seats"]] == ["Zeg", "Bob", "Ann"]
    assert view["shared_pool"] == []
    assert view["discard_size"] == 0


def test_the_deck_is_sent_as_a_size_only():
    game = create_game(SEATS, DECK_SETTINGS, seed=7, now=NOW)
    for view in views_for(game):
        assert "deck" not in view
        assert isinstance(view["deck_size"], int)
    # 5 resources x 13 + 15 gold + 6 specials, minus what the first donor drew
    assert views_for(game)[0]["deck_size"] < 5 * 13 + 15 + 6


def test_the_seed_is_never_in_a_player_view():
    game = create_game(SEATS, DECK_SETTINGS, seed=987654321, now=NOW)
    for view in views_for(game):
        assert "987654321" not in json.dumps(view)


def test_the_donor_sees_the_cards_they_drew_and_others_only_a_count():
    game = create_game(SEATS, DECK_SETTINGS, seed=7, now=NOW)
    donor, other = player_view(game, 0), player_view(game, 1)
    # n players draw n + 1 non-special cards
    assert len(donor["donation"]["cards"]) == len(SEATS) + 1
    assert all(not c["isSpecial"] for c in donor["donation"]["cards"])
    assert "cards" not in other["donation"]
    assert other["donation"]["cards_count"] == len(SEATS) + 1
    assert all_cards_in(other) == []


def test_other_seats_hands_are_sent_as_counts_only():
    game = create_game(SEATS, DECK_SETTINGS, seed=7, now=NOW)
    for seat, view in enumerate(views_for(game)):
        assert isinstance(view["hand"], list)
        for s in view["seats"]:
            assert "hand" not in s
            assert isinstance(s["hand_size"], int)


def test_only_the_donor_has_legal_moves():
    game = create_game(SEATS, DECK_SETTINGS, seed=7, now=NOW)
    donor, *others = views_for(game)
    assert donor["legal_moves"]
    for view in others:
        assert view["legal_moves"] == []


def _seed_where_first_donor_draws(special):
    for seed in range(500):
        donation = player_view(create_game(SEATS, DECK_SETTINGS, seed=seed, now=NOW), 0)["donation"]
        if bool(donation.get("special")) == special:
            return seed
    raise AssertionError("no such seed")


def test_without_a_special_card_the_donor_may_keep_discard_or_donate_the_current_card():
    game = create_game(SEATS, DECK_SETTINGS, seed=_seed_where_first_donor_draws(False), now=NOW)
    moves = player_view(game, 0)["legal_moves"]
    assert sorted(m["type"] for m in moves) == ["discard", "donate", "keep"]


def test_a_drawn_special_card_must_be_played_on_the_dice_first():
    game = create_game(SEATS, DECK_SETTINGS, seed=_seed_where_first_donor_draws(True), now=NOW)
    donor, other = player_view(game, 0), player_view(game, 1)
    special = donor["donation"]["special"]
    assert special["isSpecial"]
    if special["type"] == "Both":
        assert donor["legal_moves"] == [
            {"type": "choose_direction", "direction": "plus"},
            {"type": "choose_direction", "direction": "minus"},
        ]
    else:
        assert donor["legal_moves"] == [{"type": "modify_die", "die": i} for i in range(5)]
    assert "special" not in other["donation"]


def test_deck_settings_change_the_deck():
    small = {"gold": {"1": 0, "2": 0, "3": 0}, "resource": {"1": 2, "2": 0, "3": 0, "4": 0}}
    view = player_view(create_game(SEATS, small, seed=7, now=NOW), 0)
    # 10 resource cards + 6 specials; the donor drew 4 non-specials plus any specials on top
    assert view["deck_size"] + len(view["donation"]["cards"]) + _specials_drawn(view) == 16


def test_blank_deck_settings_count_as_zero():
    blank = {"gold": {"1": "", "2": 0, "3": 0}, "resource": {"1": 2, "2": "", "3": 0, "4": 0}}
    view = player_view(create_game(SEATS, blank, seed=7, now=NOW), 0)
    assert view["deck_size"] + len(view["donation"]["cards"]) + _specials_drawn(view) == 16


def _specials_drawn(donor_view):
    return donor_view["donation"].get("specials_drawn", 0)
