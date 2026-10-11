import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine import apply_move, create_game, game_result, player_view, score

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


# --- Shared selection (#50) ---------------------------------------------------


def _finish_donation(game, seats=SEATS):
    """Play the current donor's whole turn: any special cards on the first
    legal dice, then keep, discard and donate the rest."""
    donor = player_view(game, 0)["current_seat"]
    while player_view(game, donor)["phase"] == "donation":
        moves = player_view(game, donor)["legal_moves"]
        types = [m["type"] for m in moves]
        move = next((m for m in moves if m["type"] in ("choose_direction", "modify_die")), None)
        if move is None:
            move = {"type": "keep" if "keep" in types else "discard" if "discard" in types else "donate"}
        game = _apply(game, donor, move)
    return game


def _selection_game():
    """A Game in shared selection after the first donor's turn."""
    return _finish_donation(_plain_game())


def test_the_selecting_seat_takes_a_card_from_the_shared_pool_into_its_hand():
    game = _selection_game()
    pool = player_view(game, 1)["shared_pool"]
    game = _apply(game, 1, {"type": "take", "card": 1})
    views = views_for(game)
    assert views[1]["hand"] == [pool[1]]
    for view in views:
        assert view["shared_pool"] == [pool[0]]
        assert view["current_seat"] == 2
        assert view["phase"] == "shared_selection"
        assert [s["hand_size"] for s in view["seats"]] == [1, 1, 0]


def test_only_the_selecting_seat_may_take_and_any_pool_card_is_offered():
    views = views_for(_selection_game())
    assert views[1]["legal_moves"] == [{"type": "take", "card": 0}, {"type": "take", "card": 1}]
    assert views[0]["legal_moves"] == [] and views[2]["legal_moves"] == []


def test_illegal_takes_are_rejected():
    game = _selection_game()
    assert "turn" in _rejected(game, 2, {"type": "take", "card": 0})
    assert "turn" in _rejected(game, 0, {"type": "take", "card": 0})
    for card in [2, -1, None, "0", 0.0, True, [0]]:
        assert "shared pool" in _rejected(game, 1, {"type": "take", "card": card})
    assert "shared pool" in _rejected(game, 1, {"type": "take"})
    assert "Seat" in _rejected(game, 9, {"type": "take", "card": 0})
    assert "donation" in _rejected(game, 1, {"type": "keep"})


def test_taking_a_gold_card_adds_its_value_to_the_takers_gold():
    for seed in range(500):
        game = create_game(SEATS, DECK_SETTINGS, seed=seed, now=NOW)
        if player_view(game, 0)["donation"]["special"]:
            continue
        game = _finish_donation(game)
        pool = player_view(game, 1)["shared_pool"]
        gold = [i for i, c in enumerate(pool) if c["type"] == "Gold"]
        if gold:
            break
    else:
        raise AssertionError("no such seed")
    game = _apply(game, 1, {"type": "take", "card": gold[0]})
    assert player_view(game, 0)["seats"][1]["gold"] == pool[gold[0]]["value"]


def test_a_take_outside_shared_selection_is_rejected():
    assert "shared selection" in _rejected(_plain_game(), 0, {"type": "take", "card": 0})


def test_when_every_other_seat_has_taken_the_next_seat_starts_donating():
    game = _selection_game()
    deck_size = player_view(game, 0)["deck_size"]
    game = _apply(game, 1, {"type": "take", "card": 0})
    game = _apply(game, 2, {"type": "take", "card": 0})
    views = views_for(game)
    for view in views:
        assert view["phase"] == "donation"
        assert view["current_seat"] == 1
        assert view["shared_pool"] == []
        assert view["donation"]["donor"] == 1
        assert view["deck_size"] < deck_size
        assert [s["hand_size"] for s in view["seats"]] == [1, 1, 1]
    assert views[1]["donation"]["cards_count"] == len(SEATS) + 1
    assert views[1]["legal_moves"]
    assert views[0]["legal_moves"] == [] and views[2]["legal_moves"] == []


SMALL_DECK = {"gold": {"1": 0, "2": 0, "3": 0}, "resource": {"1": 1, "2": 0, "3": 0, "4": 0}}


def _small_selection_game(deck_left):
    """A Game with a 5-resource-card deck in shared selection, whose deck
    then holds `deck_left(size)` cards."""
    for seed in range(500):
        game = _finish_donation(create_game(SEATS, SMALL_DECK, seed=seed, now=NOW))
        if deck_left(player_view(game, 0)["deck_size"]):
            return game
    raise AssertionError("no such seed")


def _take_all(game):
    while player_view(game, 0)["phase"] == "shared_selection":
        seat = player_view(game, 0)["current_seat"]
        game = _apply(game, seat, {"type": "take", "card": 0})
    return game


def test_when_the_deck_is_short_of_a_full_draw_the_game_moves_to_the_auction():
    game = _small_selection_game(lambda size: size < len(SEATS) + 1)
    deck_size = player_view(game, 0)["deck_size"]
    game = _take_all(game)
    for view in views_for(game):
        assert view["phase"] == "auction"
        assert view["shared_pool"] == []
        assert view["donation"] is None
        # React checks the deck before drawing: nothing more is drawn.
        assert view["deck_size"] == deck_size
        # React bids in auctionTurnOffset order, which starts at Seat 0 (#51).
        assert view["current_seat"] == 0
        assert bool(view["legal_moves"]) == (view["you"] == 0)
        assert view["discard_size"] == 1
        assert [s["hand_size"] for s in view["seats"]] == [1, 1, 1]


def test_with_two_seats_one_take_hands_the_donation_to_the_other_seat():
    seats = SEATS[:2]
    game = _finish_donation(create_game(seats, DECK_SETTINGS, seed=_seed_where_first_donor_draws(False), now=NOW))
    assert player_view(game, 1)["legal_moves"] == [{"type": "take", "card": 0}]
    game = _apply(game, 1, {"type": "take", "card": 0})
    view = player_view(game, 1)
    assert (view["phase"], view["current_seat"]) == ("donation", 1)
    assert view["legal_moves"]


def test_a_lone_seat_with_no_one_to_take_goes_straight_on_to_its_next_donation():
    for seed in range(500):
        game = create_game(SEATS[:1], DECK_SETTINGS, seed=seed, now=NOW)
        if not player_view(game, 0)["donation"]["special"]:
            break
    else:
        raise AssertionError("no such seed")
    deck_size = player_view(game, 0)["deck_size"]
    # One Seat draws two cards and donates none of them.
    game = _apply(_apply(game, 0, {"type": "keep"}), 0, {"type": "discard"})
    view = player_view(game, 0)
    assert (view["phase"], view["current_seat"]) == ("donation", 0)
    assert view["deck_size"] < deck_size
    assert view["legal_moves"]


def test_when_the_next_draw_comes_up_short_of_ordinary_cards_the_game_moves_to_the_auction():
    # Only one ordinary card is left, but enough specials to make a full draw.
    game = _small_selection_game(lambda size: size >= len(SEATS) + 1)
    game = _take_all(game)
    for view in views_for(game):
        assert view["phase"] == "auction"
        assert view["donation"] is None
        assert bool(view["legal_moves"]) == (view["you"] == 0)


# --- Auction bidding (#51) ----------------------------------------------------


def _play_to_auction(game):
    """Play donation turns and shared selections (always the first legal
    choices) until the Game reaches the auction."""
    while player_view(game, 0)["phase"] in ("donation", "shared_selection"):
        game = _finish_donation(game) if player_view(game, 0)["phase"] == "donation" else _take_all(game)
    return game


AUCTION_DECK = {"gold": {"1": 2, "2": 2, "3": 0}, "resource": {"1": 2, "2": 0, "3": 0, "4": 0}}


def _auction_game(ok=lambda views: True):
    """A Game in the auction, with at least two cards to auction, whose
    Player Views satisfy `ok`."""
    for seed in range(500):
        game = _play_to_auction(create_game(SEATS, AUCTION_DECK, seed=seed, now=NOW))
        views = views_for(game)
        if views[0]["phase"] == "auction" and views[0]["discard_size"] >= 2 and ok(views):
            return game
    raise AssertionError("no such seed")


def test_the_auction_shows_every_seat_the_front_card_and_seat_zero_bids_first():
    game = _auction_game()
    views = views_for(game)
    card = views[0]["auction"]["card"]
    for view in views:
        assert view["phase"] == "auction"
        assert view["current_seat"] == 0
        auction = view["auction"]
        assert auction["card"] == card
        assert auction["bidding_order"] == [0, 1, 2]
        assert auction["active"] == [True, True, True]
        assert (auction["bid"], auction["highest_bidder"], auction["winner"]) == (0, None, None)
        # Only the card at auction is shown; the rest of the discard pile is a size.
        assert "discard" not in view
        assert all_cards_in({k: v for k, v in view.items() if k != "hand"}) == [card]
    assert {"type": "pass"} in views[0]["legal_moves"]
    assert views[1]["legal_moves"] == [] and views[2]["legal_moves"] == []


def _non_gold_card(views):
    return views[0]["auction"]["card"]["type"] != "Gold"


def test_a_bid_on_a_non_gold_card_may_be_any_whole_amount_of_gold_the_seat_has():
    game = _auction_game(lambda views: _non_gold_card(views) and views[0]["seats"][0]["gold"] >= 2)
    gold = player_view(game, 0)["seats"][0]["gold"]
    assert player_view(game, 1)["auction"]["pay_in"] == "gold"
    assert player_view(game, 0)["legal_moves"] == [{"type": "bid", "min": 1, "max": gold}, {"type": "pass"}]
    game = _apply(game, 0, {"type": "bid", "amount": 2})
    for view in views_for(game):
        auction = view["auction"]
        assert (auction["bid"], auction["highest_bidder"], auction["winner"]) == (2, 0, None)
        assert auction["active"] == [True, True, True]
        assert view["current_seat"] == 1
    assert player_view(game, 0)["legal_moves"] == []


def test_passing_takes_a_seat_out_of_the_bidding_for_this_card():
    game = _auction_game()
    game = _apply(game, 0, {"type": "pass"})
    for view in views_for(game):
        assert view["auction"]["active"] == [False, True, True]
        assert view["current_seat"] == 1
        assert view["auction"]["winner"] is None
    game = _apply(game, 1, {"type": "pass"})
    # Seat 2 is still in; with no bid yet it must bid or pass.
    assert player_view(game, 0)["current_seat"] == 2
    assert player_view(game, 0)["legal_moves"] == []
    assert "passed" in _rejected(game, 0, {"type": "pass"})
    assert "passed" in _rejected(game, 0, {"type": "bid", "amount": 1})


def _can_bid(seat):
    """Whether `seat` could bid 1 on the first card: it has the gold, or for
    a Gold card (bid for in cards) a card in hand."""

    def ok(views):
        card, me = views[0]["auction"]["card"], views[0]["seats"][seat]
        return (me["hand_size"] if card["type"] == "Gold" else me["gold"]) >= 1

    return ok


def test_a_bid_that_leaves_one_seat_in_wins_the_card_and_the_game_awaits_payment():
    game = _auction_game(_can_bid(2))
    card = player_view(game, 0)["auction"]["card"]
    game = _apply(game, 0, {"type": "pass"})
    game = _apply(game, 1, {"type": "pass"})
    game = _apply(game, 2, {"type": "bid", "amount": 1})
    for view in views_for(game):
        assert view["phase"] == "auction"
        assert view["auction"]["winner"] == {"seat": 2, "card": card, "bid": 1}
        # Only the winner may move now, and only to pay (#52).
        assert [m["type"] for m in view["legal_moves"]] == (["pay"] if view["you"] == 2 else [])
    assert "pay" in _rejected(game, 2, {"type": "bid", "amount": 2})


def test_when_all_but_the_highest_bidder_pass_the_highest_bidder_wins():
    game = _auction_game(_can_bid(0))
    card = player_view(game, 0)["auction"]["card"]
    game = _apply(game, 0, {"type": "bid", "amount": 1})
    game = _apply(game, 1, {"type": "pass"})
    assert player_view(game, 0)["auction"]["winner"] is None
    game = _apply(game, 2, {"type": "pass"})
    for view in views_for(game):
        assert view["auction"]["winner"] == {"seat": 0, "card": card, "bid": 1}
        assert [m["type"] for m in view["legal_moves"]] == (["pay"] if view["you"] == 0 else [])


def _all_pass(game):
    for _ in SEATS:
        game = _apply(game, player_view(game, 0)["current_seat"], {"type": "pass"})
    return game


def test_a_card_everyone_passes_on_is_removed_and_the_next_card_goes_up_one_seat_later():
    game = _auction_game()
    first = player_view(game, 0)
    game = _all_pass(game)
    for view in views_for(game):
        assert view["phase"] == "auction"
        assert view["discard_size"] == first["discard_size"] - 1
        assert view["auction"]["winner"] is None
        assert view["auction"]["bidding_order"] == [1, 2, 0]
        assert view["auction"]["active"] == [True, True, True]
        assert (view["auction"]["bid"], view["auction"]["highest_bidder"]) == (0, None)
        assert view["current_seat"] == 1
        # The card everyone passed on is out of the Game.
        assert view["seats"] == first["seats"]
    assert {"type": "pass"} in player_view(game, 1)["legal_moves"]
    assert player_view(game, 0)["legal_moves"] == []


def test_when_the_last_card_is_passed_on_the_game_is_over():
    game = _auction_game()
    while player_view(game, 0)["phase"] == "auction":
        game = _all_pass(game)
    for view in views_for(game):
        assert view["phase"] == "results"
        assert view["discard_size"] == 0
        assert view["auction"] is None
        assert view["legal_moves"] == []


def test_illegal_bids_are_rejected():
    game = _auction_game(lambda views: _non_gold_card(views) and all(s["gold"] >= 2 for s in views[0]["seats"][:2]))
    gold = player_view(game, 1)["seats"][1]["gold"]
    assert "turn" in _rejected(game, 1, {"type": "bid", "amount": 1})
    assert "turn" in _rejected(game, 2, {"type": "pass"})
    for amount in [0, -1, None, "1", 1.0, True, [1], {}]:
        _rejected(game, 0, {"type": "bid", "amount": amount})
    _rejected(game, 0, {"type": "bid"})
    assert "auction" in _rejected(_plain_game(), 0, {"type": "bid", "amount": 1})
    assert "auction" in _rejected(_plain_game(), 0, {"type": "pass"})
    assert "Seat" in _rejected(game, 5, {"type": "pass"})

    game = _apply(game, 0, {"type": "bid", "amount": 1})
    # Once someone has bid, a bid must beat it.
    assert player_view(game, 1)["legal_moves"] == [{"type": "bid", "min": 2, "max": gold}, {"type": "pass"}]
    assert "at least 2" in _rejected(game, 1, {"type": "bid", "amount": 1})
    assert "gold" in _rejected(game, 1, {"type": "bid", "amount": gold + 1})
    assert "turn" in _rejected(game, 0, {"type": "bid", "amount": 2})


def test_a_seat_that_cannot_beat_the_bid_may_only_pass():
    game = _auction_game(lambda views: _non_gold_card(views) and views[0]["seats"][1]["gold"] == 0)
    game = _apply(game, 0, {"type": "pass"})
    assert player_view(game, 1)["legal_moves"] == [{"type": "pass"}]
    assert "at most 0" in _rejected(game, 1, {"type": "bid", "amount": 1})


def test_a_gold_card_is_bid_for_in_cards_from_the_hand():
    game = _auction_game(
        lambda views: views[0]["auction"]["card"]["type"] == "Gold"
        and views[0]["seats"][0]["hand_size"] != views[0]["seats"][0]["gold"]
    )
    hand = player_view(game, 0)["seats"][0]["hand_size"]
    assert player_view(game, 1)["auction"]["pay_in"] == "cards"
    assert player_view(game, 0)["legal_moves"][0] == {"type": "bid", "min": 1, "max": hand}
    assert "cards" in _rejected(game, 0, {"type": "bid", "amount": hand + 1})


def test_the_turn_skips_seats_that_have_passed():
    def rich_enough(views):
        high = [s["hand_size"] if views[0]["auction"]["card"]["type"] == "Gold" else s["gold"] for s in views[0]["seats"]]
        return high[0] >= 3 and high[2] >= 2

    game = _auction_game(rich_enough)
    game = _apply(game, 0, {"type": "bid", "amount": 1})
    game = _apply(game, 1, {"type": "pass"})
    game = _apply(game, 2, {"type": "bid", "amount": 2})
    assert player_view(game, 0)["current_seat"] == 0
    game = _apply(game, 0, {"type": "bid", "amount": 3})
    assert player_view(game, 0)["current_seat"] == 2
    assert player_view(game, 0)["auction"]["highest_bidder"] == 0


def test_with_nothing_discarded_there_is_no_auction_and_the_game_is_over():
    # Only the six special cards: the first draw comes up short with nothing discarded.
    empty = {"gold": {"1": 0, "2": 0, "3": 0}, "resource": {"1": 0, "2": 0, "3": 0, "4": 0}}
    for view in views_for(create_game(SEATS, empty, seed=7, now=NOW)):
        assert view["phase"] == "results"
        assert view["auction"] is None
        assert view["legal_moves"] == []


def test_a_seat_that_does_not_exist_has_no_legal_moves_in_the_auction():
    from engine.game import legal_moves

    game = _auction_game()
    for seat in [3, -1, None, "0", True]:
        assert legal_moves(game, seat) == []
        _rejected(game, seat, {"type": "pass"})


def test_on_the_second_card_the_bidding_starts_one_seat_on_and_wraps_round():
    for seed in range(500):
        game = _play_to_auction(create_game(SEATS, AUCTION_DECK, seed=seed, now=NOW))
        first = player_view(game, 0)
        if first["phase"] != "auction" or first["discard_size"] < 2:
            continue
        game = _all_pass(game)
        views = views_for(game)
        if _can_bid(2)(views) and _can_bid(0)(views) and _can_bid_two(views, 0):
            break
    else:
        raise AssertionError("no such seed")
    card = player_view(game, 0)["auction"]["card"]
    assert player_view(game, 0)["auction"]["bidding_order"] == [1, 2, 0]
    assert player_view(game, 0)["current_seat"] == 1
    game = _apply(game, 1, {"type": "pass"})
    assert player_view(game, 0)["current_seat"] == 2
    game = _apply(game, 2, {"type": "bid", "amount": 1})
    # The order wraps round from the last Seat back to Seat 0.
    assert player_view(game, 0)["current_seat"] == 0
    game = _apply(game, 0, {"type": "bid", "amount": 2})
    assert player_view(game, 0)["current_seat"] == 2
    game = _apply(game, 2, {"type": "pass"})
    for view in views_for(game):
        assert view["auction"]["winner"] == {"seat": 0, "card": card, "bid": 2}
        assert view["current_seat"] == 0


def _can_bid_two(views, seat):
    card, me = views[0]["auction"]["card"], views[0]["seats"][seat]
    return (me["hand_size"] if card["type"] == "Gold" else me["gold"]) >= 2


# --- Auction payment (#52) ----------------------------------------------------


def _gold_card(views):
    return views[0]["auction"]["card"]["type"] == "Gold"


def _seat_two_wins(game, amount=1):
    """Seats 0 and 1 pass and Seat 2 bids `amount`, winning the card."""
    game = _apply(game, 0, {"type": "pass"})
    game = _apply(game, 1, {"type": "pass"})
    return _apply(game, 2, {"type": "bid", "amount": amount})


def test_a_gold_card_won_is_in_the_winners_hand_and_gold_at_once():
    game = _auction_game(lambda views: _gold_card(views) and _can_bid(2)(views))
    before = player_view(game, 2)
    card = before["auction"]["card"]
    game = _seat_two_wins(game)
    for view in views_for(game):
        me = view["seats"][2]
        assert me["hand_size"] == before["seats"][2]["hand_size"] + 1
        assert me["gold"] == before["seats"][2]["gold"] + card["value"]
    assert player_view(game, 2)["hand"] == before["hand"] + [card]


def test_the_winner_of_a_gold_card_pays_exactly_the_bid_in_other_cards_from_the_hand():
    game = _auction_game(lambda views: _gold_card(views) and _can_bid(2)(views))
    before = player_view(game, 0)
    game = _seat_two_wins(game)
    won = player_view(game, 2)
    hand, gold = won["hand"], won["seats"][2]["gold"]
    assert won["legal_moves"] == [{"type": "pay", "pay_in": "cards", "exactly": 1, "excluding": [len(hand) - 1]}]
    assert player_view(game, 0)["legal_moves"] == [] and player_view(game, 1)["legal_moves"] == []

    paid = hand[0]
    game = _apply(game, 2, {"type": "pay", "cards": [0]})
    for view in views_for(game):
        me = view["seats"][2]
        assert me["hand_size"] == len(hand) - 1
        # Paying with a Gold card gives up its gold too.
        assert me["gold"] == gold - (paid["value"] if paid["type"] == "Gold" else 0)
        # The card is resolved: the next one goes up, one Seat on.
        assert view["discard_size"] == before["discard_size"] - 1
        assert view["auction"]["winner"] is None
        assert view["auction"]["bidding_order"] == [1, 2, 0]
        assert view["current_seat"] == 1
    # The paid card is gone and the won Gold card stays.
    assert player_view(game, 2)["hand"] == hand[1:]


def _gold_in_hand(game, seat):
    return [i for i, c in enumerate(player_view(game, seat)["hand"]) if c["type"] == "Gold"]


def _seat_two_wins_non_gold(ok=lambda game: True, amount=1):
    """A Game where Seat 2 has just won a non-Gold card for `amount` gold
    and `ok`."""
    for seed in range(500):
        game = _play_to_auction(create_game(SEATS, AUCTION_DECK, seed=seed, now=NOW))
        views = views_for(game)
        if views[0]["phase"] == "auction" and views[0]["discard_size"] >= 2 and _non_gold_card(views) and views[0]["seats"][2]["gold"] >= amount:
            game = _seat_two_wins(game, amount)
            if ok(game):
                return game
    raise AssertionError("no such seed")


def test_the_winner_of_another_card_pays_in_gold_cards_worth_at_least_the_bid_with_no_change():
    # A Gold 2 pays a bid of 1: the card is gone, all 2 gold with it.
    game = _seat_two_wins_non_gold(lambda g: any(player_view(g, 2)["hand"][i]["value"] >= 2 for i in _gold_in_hand(g, 2)))
    won = player_view(game, 2)
    hand, gold, card = won["hand"], won["seats"][2]["gold"], won["auction"]["card"]
    assert won["legal_moves"] == [{"type": "pay", "pay_in": "gold", "at_least": 1}]
    i = next(i for i in _gold_in_hand(game, 2) if hand[i]["value"] >= 2)

    game = _apply(game, 2, {"type": "pay", "cards": [i]})
    for view in views_for(game):
        assert view["seats"][2]["gold"] == gold - hand[i]["value"]
        assert view["seats"][2]["hand_size"] == len(hand)
        assert view["current_seat"] == 1
    # The paid Gold card is gone and the won card joins the hand.
    assert player_view(game, 2)["hand"] == hand[:i] + hand[i + 1 :] + [card]


def test_a_gold_payment_must_be_gold_cards_worth_at_least_the_bid():
    def ok(g):
        hand = player_view(g, 2)["hand"]
        return any(c["type"] != "Gold" for c in hand) and _gold_in_hand(g, 2)

    game = _seat_two_wins_non_gold(ok)
    hand = player_view(game, 2)["hand"]
    other = next(i for i, c in enumerate(hand) if c["type"] != "Gold")
    assert "Gold" in _rejected(game, 2, {"type": "pay", "cards": [other]})
    assert "at least 1" in _rejected(game, 2, {"type": "pay", "cards": []})


def test_gold_cards_worth_less_than_the_bid_are_rejected():
    def ones(g):
        return [i for i in _gold_in_hand(g, 2) if player_view(g, 2)["hand"][i]["value"] == 1]

    game = _seat_two_wins_non_gold(ones, amount=2)
    assert "at least 2" in _rejected(game, 2, {"type": "pay", "cards": [ones(game)[0]]})


def test_illegal_payments_are_rejected():
    game = _auction_game(lambda views: _gold_card(views) and _can_bid(2)(views))
    # Before anyone has won, and outside the auction, there is nothing to pay.
    assert "won" in _rejected(game, 0, {"type": "pay", "cards": [0]})
    assert "auction" in _rejected(_plain_game(), 0, {"type": "pay", "cards": [0]})

    game = _seat_two_wins(game)
    hand = player_view(game, 2)["hand"]
    won = len(hand) - 1
    assert "Ann" in _rejected(game, 1, {"type": "pay", "cards": [0]})
    assert "Seat" in _rejected(game, 7, {"type": "pay", "cards": [0]})
    for cards in [None, 0, "0", [len(hand)], [-1], [True], [0.0], ["0"], [[0]], {"0": 0}]:
        assert "hand" in _rejected(game, 2, {"type": "pay", "cards": cards})
    _rejected(game, 2, {"type": "pay"})
    assert "once" in _rejected(game, 2, {"type": "pay", "cards": [0, 0]})
    assert "won" in _rejected(game, 2, {"type": "pay", "cards": [won]})
    assert "exactly 1" in _rejected(game, 2, {"type": "pay", "cards": []})
    if won >= 2:
        assert "exactly 1" in _rejected(game, 2, {"type": "pay", "cards": [0, 1]})
    # While the winner pays, no one bids.
    assert "pay" in _rejected(game, 0, {"type": "bid", "amount": 1})


def _a_payment(view):
    """A payment meeting the winner's descriptor: the first cards it may
    give, or every Gold card in its hand."""
    (pay,) = view["legal_moves"]
    if pay["pay_in"] == "cards":
        free = [i for i in range(len(view["hand"])) if i not in pay["excluding"]]
        return {"type": "pay", "cards": free[: pay["exactly"]]}
    return {"type": "pay", "cards": [i for i, c in enumerate(view["hand"]) if c["type"] == "Gold"]}


def test_every_winner_can_pay_its_highest_bid_and_the_last_payment_ends_the_game():
    """A Seat's gold is always the total of the Gold cards in its hand, so
    the bid cap (gold, or for a Gold card the hand without it) is always
    affordable."""
    payments, ended_by_payment = 0, 0
    for seed in range(30):
        game, move = _play_to_auction(create_game(SEATS, AUCTION_DECK, seed=seed, now=NOW)), None
        while player_view(game, 0)["phase"] == "auction":
            for seat in range(len(SEATS)):
                view = player_view(game, seat)
                assert view["seats"][seat]["gold"] == sum(c["value"] for c in view["hand"] if c["type"] == "Gold")
            seat = player_view(game, 0)["current_seat"]
            view = player_view(game, seat)
            moves = {m["type"]: m for m in view["legal_moves"]}
            if "pay" in moves:
                move = _a_payment(view)
                payments += 1
            elif "bid" in moves and view["auction"]["highest_bidder"] is None:
                move = {"type": "bid", "amount": moves["bid"]["max"]}
            else:
                move = {"type": "pass"}
            game = _apply(game, seat, move)
        ended_by_payment += bool(move) and move["type"] == "pay"
        for view in views_for(game):
            assert view["phase"] == "results"
            assert view["auction"] is None and view["legal_moves"] == []
    assert payments and ended_by_payment


def test_a_gold_payment_shows_others_only_the_gold_paid():
    game = _seat_two_wins_non_gold(lambda g: len(_gold_in_hand(g, 2)) > 0)
    i = _gold_in_hand(game, 2)[0]
    paid = player_view(game, 2)["hand"][i]
    game = _apply(game, 2, {"type": "pay", "cards": [i]})
    for view in views_for(game):
        assert view["auction"]["last_payment"] == {"seat": 2, "gold": paid["value"]}
        if view["you"] != 2:
            # Which Gold cards paid is not shown, only the card now at auction.
            assert all_cards_in({k: v for k, v in view.items() if k != "hand"}) == [view["auction"]["card"]]


def test_the_cards_paid_for_a_gold_card_are_shown_to_every_seat():
    # React posts the discarded cards to the Room's chat, so they are public.
    game = _seat_two_wins(_auction_game(lambda views: _gold_card(views) and _can_bid(2)(views)))
    paid = player_view(game, 2)["hand"][0]
    game = _apply(game, 2, {"type": "pay", "cards": [0]})
    for view in views_for(game):
        assert view["auction"]["last_payment"] == {"seat": 2, "cards": [paid]}


# --- Scoring and the end of the Game (#53) ------------------------------------


def _card(type_, value, tie_breaker="A"):
    return {"type": type_, "value": value, "tieBreaker": tie_breaker, "isSpecial": False}


def _rolled(**values):
    return [{"resource_type": t, "value": v} for t, v in values.items()]


def test_the_highest_total_of_a_resource_wins_its_die():
    seats = [
        {"name": "Zeg", "gold": 1, "hand": [_card("Art", 2), _card("Art", 1), _card("Gold", 1)]},
        {"name": "Bob", "gold": 0, "hand": [_card("Art", 2), _card("Herbs", 1)]},
        {"name": "Ann", "gold": 0, "hand": []},
    ]
    results = score(seats, _rolled(Art=3, Herbs=5))
    assert results["log"][:6] == [
        "Scoring Art (Die value 3)",
        "Totals — Art: Zeg: 3, Bob: 2, Ann: 0",
        "Zeg wins Art for 3 points",
        "Scoring Herbs (Die value 5)",
        "Totals — Herbs: Zeg: 0, Bob: 1, Ann: 0",
        "Bob wins Herbs for 5 points",
    ]
    assert results["standings"] == [
        {"seat": 1, "name": "Bob", "points": 5, "gold": 0, "rank": 1, "elo": 10},
        {"seat": 0, "name": "Zeg", "points": 3, "gold": 1, "rank": 2, "elo": 0},
        {"seat": 2, "name": "Ann", "points": 0, "gold": 0, "rank": 3, "elo": -10},
    ]
    assert results["log"][6:] == ["🏆 Bob wins the game!", "Final Rankings: Bob: #1, elo: 10, Zeg: #2, elo: 0, Ann: #3, elo: -10"]


def test_a_tied_total_goes_to_the_lowest_tie_breaker_letter_among_that_resources_cards():
    # React reads card.tie_breaker, which no card has, so its tie-break never
    # decides anything; the engine uses the cards' tieBreaker letter as meant.
    seats = [
        {"name": "Zeg", "gold": 0, "hand": [_card("Art", 2, "C"), _card("Herbs", 1, "A")]},
        {"name": "Bob", "gold": 0, "hand": [_card("Art", 1, "D"), _card("Art", 1, "B")]},
        {"name": "Ann", "gold": 0, "hand": [_card("Art", 1, "A")]},
    ]
    results = score(seats, _rolled(Art=4))
    assert results["log"][1:3] == ["Totals — Art: Zeg: 2, Bob: 2, Ann: 1", "Tiebreaker! Bob wins Art"]
    assert [(s["name"], s["points"]) for s in results["standings"]] == [("Bob", 4), ("Zeg", 0), ("Ann", 0)]


def test_when_the_tie_breakers_tie_too_the_die_is_split_evenly():
    seats = [
        {"name": "Zeg", "gold": 0, "hand": [_card("Art", 2, "B")]},
        {"name": "Bob", "gold": 0, "hand": [_card("Art", 2, "B")]},
        {"name": "Ann", "gold": 0, "hand": [_card("Herbs", 4, "A")]},
    ]
    results = score(seats, _rolled(Art=3, Herbs=2))
    assert results["log"][2] == "Tie-breakers also tied on Art. 1.5 point(s) to each: Zeg, Bob"
    assert [(s["name"], s["points"]) for s in results["standings"]] == [("Ann", 2), ("Zeg", 1.5), ("Bob", 1.5)]


def test_a_resource_nobody_holds_is_split_between_every_seat():
    # As in React: every Seat ties on 0, none has a tie-breaker letter.
    seats = [{"name": n, "gold": 0, "hand": []} for n in ("Zeg", "Bob")]
    results = score(seats, _rolled(Science=4))
    assert results["log"][2] == "Tie-breakers also tied on Science. 2 point(s) to each: Zeg, Bob"
    assert [s["points"] for s in results["standings"]] == [2, 2]


def test_equal_points_rank_by_gold_and_the_winner_wins_by_gold():
    seats = [
        {"name": "Zeg", "gold": 1, "hand": [_card("Art", 1)]},
        {"name": "Bob", "gold": 3, "hand": [_card("Herbs", 1)]},
    ]
    results = score(seats, _rolled(Art=2, Herbs=2))
    assert [s["name"] for s in results["standings"]] == ["Bob", "Zeg"]
    assert results["log"][-2] == "🏆 Bob wins by gold tiebreaker!"


def test_seats_equal_on_points_and_gold_keep_seat_order_but_share_the_win():
    # React's sort is stable, so exactly tied Seats are ranked in Seat order
    # and get different Elo; its log still calls the top of the table a tie.
    seats = [{"name": n, "gold": 2, "hand": []} for n in ("Zeg", "Bob", "Ann", "Cid")]
    results = score(seats, [])
    assert [(s["name"], s["rank"], s["elo"]) for s in results["standings"]] == [
        ("Zeg", 1, 20), ("Bob", 2, 10), ("Ann", 3, -10), ("Cid", 4, -20),
    ]
    assert results["log"][0] == "🏆 Tie between: Zeg, Bob, Ann, Cid"


def test_when_the_auction_ends_the_game_is_scored_and_every_seat_sees_the_same_results():
    game = _auction_game()
    while player_view(game, 0)["phase"] == "auction":
        game = _all_pass(game)
    views = views_for(game)
    # Each Seat still sees only its own hand; together they are the Game's hands.
    hands = [{"name": v["seats"][v["you"]]["name"], "gold": v["seats"][v["you"]]["gold"], "hand": v["hand"]} for v in views]
    expected = score(hands, views[0]["dice"])
    for view in views:
        assert view["phase"] == "results"
        assert view["legal_moves"] == []
        assert view["results"] == expected
        assert [s["points"] for s in view["seats"]] == [
            next(s["points"] for s in expected["standings"] if s["seat"] == seat) for seat in range(len(SEATS))
        ]
        for s in view["seats"]:
            assert "hand" not in s


def test_a_game_in_progress_has_no_results():
    for view in views_for(_plain_game()):
        assert view["results"] is None


def test_a_finished_game_gives_its_placings_by_player_identity():
    assert game_result(_plain_game()) is None
    game = _auction_game()
    while player_view(game, 0)["phase"] == "auction":
        game = _all_pass(game)
    standings = player_view(game, 0)["results"]["standings"]
    assert game_result(game) == {
        "placings": [{"player_id": SEATS[s["seat"]]["player_id"], "rank": s["rank"]} for s in standings]
    }
    # Player Identities stay out of the Player Views.
    for view in views_for(game):
        assert "user:1" not in json.dumps(view)
