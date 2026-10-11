import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine import apply_move, create_game, player_view

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


def test_the_donor_sees_only_the_current_card_and_others_only_a_count():
    for special in (False, True):
        game = create_game(SEATS, DECK_SETTINGS, seed=_seed_where_first_donor_draws(special), now=NOW)
        donor, other = player_view(game, 0), player_view(game, 1)
        # A special card being played is face up for everyone; nothing else drawn is.
        face_up = [donor["donation"]["special"]] if donor["donation"]["special"] else []
        assert bool(face_up) == special
        # n players draw n + 1 non-special cards, dealt with one at a time
        assert donor["donation"]["cards_count"] == len(SEATS) + 1
        assert not donor["donation"]["card"]["isSpecial"]
        cards = all_cards_in(donor)
        assert len(cards) == 1 + len(face_up)
        assert all(c in cards for c in [donor["donation"]["card"]] + face_up)
        assert "card" not in other["donation"]
        assert other["donation"]["cards_count"] == len(SEATS) + 1
        assert all_cards_in(other) == face_up


def test_other_seats_hands_are_sent_as_counts_only():
    game = create_game(SEATS, DECK_SETTINGS, seed=7, now=NOW)
    for view in views_for(game):
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
    # A special card is played face up: every Seat sees which one is being resolved.
    assert other["donation"]["special"] == special
    assert other["legal_moves"] == []


def test_deck_settings_change_the_deck():
    small = {"gold": {"1": 0, "2": 0, "3": 0}, "resource": {"1": 2, "2": 0, "3": 0, "4": 0}}
    view = player_view(create_game(SEATS, small, seed=7, now=NOW), 0)
    # 10 resource cards + 6 specials; the donor drew 4 non-specials plus any specials on top
    assert view["deck_size"] + view["donation"]["cards_count"] + _specials_drawn(view) == 16


def test_blank_deck_settings_count_as_zero():
    blank = {"gold": {"1": "", "2": 0, "3": 0}, "resource": {"1": 2, "2": "", "3": 0, "4": 0}}
    view = player_view(create_game(SEATS, blank, seed=7, now=NOW), 0)
    assert view["deck_size"] + view["donation"]["cards_count"] + _specials_drawn(view) == 16


def _specials_drawn(donor_view):
    return donor_view["donation"].get("specials_drawn", 0)


# --- Donation Moves (#48) ---------------------------------------------------


def _plain_game():
    """A Game whose first donor drew no special cards."""
    return create_game(SEATS, DECK_SETTINGS, seed=_seed_where_first_donor_draws(False), now=NOW)


def _apply(game, seat, move):
    new_game, reason = apply_move(game, seat, move)
    assert reason is None, reason
    return new_game


def _rejected(game, seat, move):
    before = json.dumps(game, sort_keys=True)
    new_game, reason = apply_move(game, seat, move)
    assert new_game is None
    assert isinstance(reason, str) and reason
    assert json.dumps(game, sort_keys=True) == before, "a rejected Move must change nothing"
    return reason


def test_keeping_moves_on_to_the_next_card_and_hides_it_from_others():
    game = _plain_game()
    first = player_view(game, 0)["donation"]["card"]
    game = _apply(game, 0, {"type": "keep"})
    donor, other = player_view(game, 0), player_view(game, 1)
    assert donor["donation"]["kept"] == first
    assert donor["donation"]["cards_count"] == len(SEATS)
    assert sorted(m["type"] for m in donor["legal_moves"]) == ["discard", "donate"]
    assert other["donation"]["cards_count"] == len(SEATS)
    assert all_cards_in(other) == []


def test_donating_puts_the_card_in_the_shared_pool_for_everyone():
    game = _plain_game()
    card = player_view(game, 0)["donation"]["card"]
    game = _apply(game, 0, {"type": "donate"})
    for view in views_for(game):
        assert [{k: c[k] for k in card} for c in view["shared_pool"]] == [card]
        assert view["shared_pool"][0]["pooledBy"] == "Zeg"


def test_a_donor_may_donate_only_seats_minus_one_cards():
    game = _plain_game()
    for _ in range(len(SEATS) - 1):
        game = _apply(game, 0, {"type": "donate"})
    assert sorted(m["type"] for m in player_view(game, 0)["legal_moves"]) == ["discard", "keep"]
    assert "shared pool" in _rejected(game, 0, {"type": "donate"})


def test_a_donor_may_keep_only_one_card():
    game = _apply(_plain_game(), 0, {"type": "keep"})
    assert "kept" in _rejected(game, 0, {"type": "keep"})


def test_a_donor_may_discard_only_one_card():
    game = _apply(_plain_game(), 0, {"type": "discard"})
    assert "discarded" in _rejected(game, 0, {"type": "discard"})


def test_finishing_the_donation_gives_the_kept_card_and_starts_shared_selection():
    game = _plain_game()
    cards = []
    for move in ["donate", "keep", "discard", "donate"]:
        cards.append(player_view(game, 0)["donation"]["card"])
        game = _apply(game, 0, {"type": move})
    kept = cards[1]

    views = views_for(game)
    for view in views:
        assert view["phase"] == "shared_selection"
        assert view["current_seat"] == 1
        assert view["last_donor"] == 0
        assert view["donation"] is None
        assert view["discard_size"] == 1
        assert len(view["shared_pool"]) == 2
        assert [s["hand_size"] for s in view["seats"]] == [1, 0, 0]
        assert view["seats"][0]["gold"] == (kept["value"] if kept["type"] == "Gold" else 0)
    assert views[0]["hand"] == [kept]
    assert views[1]["hand"] == [] and views[2]["hand"] == []


def test_keeping_a_gold_card_adds_its_value_to_the_donors_gold():
    for seed in range(500):
        game = create_game(SEATS, DECK_SETTINGS, seed=seed, now=NOW)
        card = player_view(game, 0)["donation"]["card"]
        if not player_view(game, 0)["donation"]["special"] and card["type"] == "Gold":
            break
    else:
        raise AssertionError("no such seed")
    for move in ["keep", "discard", "donate", "donate"]:
        game = _apply(game, 0, {"type": move})
    assert player_view(game, 0)["seats"][0]["gold"] == card["value"]


def test_a_move_from_a_seat_that_is_not_donating_is_rejected():
    game = _plain_game()
    assert "turn" in _rejected(game, 1, {"type": "keep"})


def test_a_move_from_a_seat_that_does_not_exist_is_rejected():
    _rejected(_plain_game(), 7, {"type": "keep"})


def test_dealing_with_ordinary_cards_waits_for_the_special_card():
    game = create_game(SEATS, DECK_SETTINGS, seed=_seed_where_first_donor_draws(True), now=NOW)
    assert "special" in _rejected(game, 0, {"type": "keep"})


def test_a_donation_move_outside_the_donation_phase_is_rejected():
    game = _plain_game()
    for move in ["donate", "keep", "discard", "donate"]:
        game = _apply(game, 0, {"type": move})
    assert "donation" in _rejected(game, 1, {"type": "keep"})


def test_unknown_and_malformed_moves_are_rejected():
    game = _plain_game()
    _rejected(game, 0, {"type": "steal"})
    _rejected(game, 0, {})
    _rejected(game, 0, "keep")
    _rejected(game, 0, None)


def test_the_same_moves_on_the_same_seed_give_the_same_game():
    def play():
        game = _plain_game()
        for move in ["keep", "donate", "discard"]:
            game = _apply(game, 0, {"type": move})
        return views_for(game)

    assert play() == play()


# --- Special cards and dice modification (#49) -------------------------------


def _special_game(type_, value, specials_drawn=1):
    """A Game whose first donor drew, as its first special card, a `type_`
    special of `value`, with `specials_drawn` specials drawn in all."""
    for seed in range(500):
        game = create_game(SEATS, DECK_SETTINGS, seed=seed, now=NOW)
        donation = player_view(game, 0)["donation"]
        special = donation["special"]
        if special and (special["type"], special["value"], donation["specials_drawn"]) == (type_, value, specials_drawn):
            return game
    raise AssertionError("no such seed")


def _dice(game):
    return [d["value"] for d in player_view(game, 0)["dice"]]


def _with_values(values, i, delta):
    out = list(values)
    out[i] = min(6, max(1, out[i] + delta))
    return out


def test_a_plus_one_card_raises_the_chosen_die_for_every_seat_then_ordinary_cards_follow():
    game = _special_game("Plus", 1)
    before = _dice(game)
    game = _apply(game, 0, {"type": "modify_die", "die": 2})
    for view in views_for(game):
        assert [d["value"] for d in view["dice"]] == _with_values(before, 2, +1)
        assert view["donation"]["special"] is None
    assert sorted(m["type"] for m in player_view(game, 0)["legal_moves"]) == ["discard", "donate", "keep"]


def _specials_played(game):
    """The special cards the first donor must play, in order, found by
    playing them all on the first dice the Player View allows."""
    played = []
    while player_view(game, 0)["donation"]["special"]:
        donation = player_view(game, 0)["donation"]
        if donation["dice_chosen"] == [] and donation["direction"] is None:
            played.append((donation["special"]["type"], donation["special"]["value"]))
        game = _apply(game, 0, player_view(game, 0)["legal_moves"][0])
    return played


def _game_whose_specials_start(prefix, dice=lambda values: True):
    for seed in range(2000):
        game = create_game(SEATS, DECK_SETTINGS, seed=seed, now=NOW)
        if _specials_played(game)[: len(prefix)] == prefix and dice(_dice(game)):
            return game
    raise AssertionError("no such seed")


def test_a_minus_one_card_lowers_the_chosen_die():
    game = _special_game("Minus", 1)
    before = _dice(game)
    game = _apply(game, 0, {"type": "modify_die", "die": 4})
    assert _dice(game) == _with_values(before, 4, -1)


def test_a_value_two_card_changes_two_different_dice_by_one_each():
    game = _special_game("Plus", 2)
    before = _dice(game)
    game = _apply(game, 0, {"type": "modify_die", "die": 1})
    # Every Seat sees the first die change while the card is still in play.
    for view in views_for(game):
        assert [d["value"] for d in view["dice"]] == _with_values(before, 1, +1)
        assert view["donation"]["dice_chosen"] == [1]
        assert view["donation"]["special"]["type"] == "Plus"
    assert {"type": "modify_die", "die": 1} not in player_view(game, 0)["legal_moves"]
    assert "already" in _rejected(game, 0, {"type": "modify_die", "die": 1})

    game = _apply(game, 0, {"type": "modify_die", "die": 3})
    assert _dice(game) == _with_values(_with_values(before, 1, +1), 3, +1)
    assert player_view(game, 0)["donation"]["special"] is None


def test_a_both_card_takes_a_direction_first_then_changes_dice_that_way():
    game = _special_game("Both", 2)
    before = _dice(game)
    assert "direction" in _rejected(game, 0, {"type": "modify_die", "die": 0})
    game = _apply(game, 0, {"type": "choose_direction", "direction": "minus"})
    for view in views_for(game):
        assert view["donation"]["direction"] == "minus"
    assert player_view(game, 0)["legal_moves"] == [{"type": "modify_die", "die": i} for i in range(5)]
    assert "direction" in _rejected(game, 0, {"type": "choose_direction", "direction": "plus"})

    game = _apply(game, 0, {"type": "modify_die", "die": 0})
    game = _apply(game, 0, {"type": "modify_die", "die": 4})
    assert _dice(game) == _with_values(_with_values(before, 0, -1), 4, -1)
    assert player_view(game, 0)["donation"]["special"] is None


def test_a_both_card_may_increase():
    game = _special_game("Both", 1)
    before = _dice(game)
    game = _apply(game, 0, {"type": "choose_direction", "direction": "plus"})
    game = _apply(game, 0, {"type": "modify_die", "die": 2})
    assert _dice(game) == _with_values(before, 2, +1)


def test_several_special_cards_are_played_one_by_one_before_ordinary_cards():
    game = _game_whose_specials_start([("Minus", 2), ("Both", 1), ("Plus", 2)])
    assert "special" in _rejected(game, 0, {"type": "keep"})
    game = _apply(game, 0, {"type": "modify_die", "die": 0})
    game = _apply(game, 0, {"type": "modify_die", "die": 1})
    # The next special is now in play, with no dice chosen and no direction yet.
    view = player_view(game, 1)["donation"]
    assert (view["special"]["type"], view["dice_chosen"], view["direction"]) == ("Both", [], None)
    # A die changed by an earlier special may be changed again by the next one.
    game = _apply(game, 0, {"type": "choose_direction", "direction": "plus"})
    game = _apply(game, 0, {"type": "modify_die", "die": 0})
    assert player_view(game, 0)["donation"]["special"]["type"] == "Plus"
    game = _apply(game, 0, {"type": "modify_die", "die": 0})
    game = _apply(game, 0, {"type": "modify_die", "die": 1})
    assert player_view(game, 0)["donation"]["special"] is None
    assert sorted(m["type"] for m in player_view(game, 0)["legal_moves"]) == ["discard", "donate", "keep"]


def test_a_die_never_goes_below_one():
    game = _game_whose_specials_start([("Minus", 2), ("Both", 1)], dice=lambda values: 2 in values)
    low = _dice(game).index(2)
    game = _apply(game, 0, {"type": "modify_die", "die": low})
    game = _apply(game, 0, {"type": "modify_die", "die": (low + 1) % 5})
    assert _dice(game)[low] == 1
    game = _apply(game, 0, {"type": "choose_direction", "direction": "minus"})
    game = _apply(game, 0, {"type": "modify_die", "die": low})
    assert _dice(game)[low] == 1


def test_a_die_never_goes_above_six():
    game = _game_whose_specials_start([("Plus", 2), ("Both", 1), ("Both", 2)], dice=lambda values: 4 in values)
    high = _dice(game).index(4)
    other = (high + 1) % 5
    for move in [
        {"type": "modify_die", "die": high},
        {"type": "modify_die", "die": other},
        {"type": "choose_direction", "direction": "plus"},
        {"type": "modify_die", "die": high},
    ]:
        game = _apply(game, 0, move)
    assert _dice(game)[high] == 6
    game = _apply(game, 0, {"type": "choose_direction", "direction": "plus"})
    game = _apply(game, 0, {"type": "modify_die", "die": high})
    assert _dice(game)[high] == 6


def test_illegal_special_moves_are_rejected():
    game = _special_game("Plus", 1)
    assert "direction" in _rejected(game, 0, {"type": "choose_direction", "direction": "plus"})
    _rejected(game, 0, {"type": "modify_die", "die": 5})
    _rejected(game, 0, {"type": "modify_die", "die": -1})
    _rejected(game, 0, {"type": "modify_die", "die": "0"})
    _rejected(game, 0, {"type": "modify_die", "die": True})
    _rejected(game, 0, {"type": "modify_die"})
    assert "turn" in _rejected(game, 1, {"type": "modify_die", "die": 0})

    both = _special_game("Both", 1)
    _rejected(both, 0, {"type": "choose_direction", "direction": "sideways"})
    _rejected(both, 0, {"type": "choose_direction"})
    _rejected(both, 0, {"type": "choose_direction", "direction": []})
    _rejected(both, 0, {"type": "choose_direction", "direction": {}})
    _rejected(game, 0, {"type": "modify_die", "die": []})
    _rejected(game, 0, {"type": "modify_die", "die": {}})
    _rejected(game, 0, {"type": "modify_die", "die": 1.0})
    _rejected(game, 0, {"type": [], "die": 0})


def test_special_moves_without_a_special_card_are_rejected():
    game = _plain_game()
    assert "special" in _rejected(game, 0, {"type": "modify_die", "die": 0})
    assert "special" in _rejected(game, 0, {"type": "choose_direction", "direction": "plus"})
