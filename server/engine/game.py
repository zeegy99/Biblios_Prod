"""The Biblios Game engine (ADR-0002).

Pure functions of a Game, a Seat and the time: no I/O, no clock, and all
randomness comes from the seed. The rules are ported from the React
components (frontend_/src/components), which are the canonical rules.

A Game is a plain JSON-serialisable dict; treat it as opaque outside this
module and read it only through player_view.
"""

import random

RESOURCE_TYPES = ["Religion", "Science", "Military", "Art", "Herbs"]
DICE_TYPES = ["Art", "Herbs", "Military", "Religion", "Science"]
TIE_BREAKERS = list("ABCDEFGHIJK")
SPECIAL_TYPES = ["Plus", "Minus", "Both"]

DEFAULT_RESOURCE = {"1": 5, "2": 4, "3": 2, "4": 2}
DEFAULT_GOLD = {"1": 5, "2": 5, "3": 5}


def create_game(seats, deck_settings, seed, now):
    """A new Game for the given Seats ([{player_id, name}] in turn order),
    with the deck shuffled and the dice rolled from the seed. The first Seat
    starts the donation phase with its cards already drawn."""
    rng = random.Random(seed)
    game = {
        "phase": "donation",
        "seats": [
            {"player_id": s["player_id"], "name": s["name"], "hand": [], "gold": 0, "points": 0}
            for s in seats
        ],
        "deck": _build_deck(deck_settings or {}, rng),
        "discard": [],
        "shared_pool": [],
        "dice": [{"resource_type": t, "value": rng.randint(2, 4)} for t in DICE_TYPES],
        "current_seat": 0,
        "last_donor": None,
        "donation": None,
        "turn_started_at": now,
    }
    _start_donation_turn(game)
    return game


def player_view(game, seat):
    """What `seat` (an index into the Game's Seats) is allowed to see: the
    public parts of the Game, its own hand, other hands as counts, the deck
    as a size, and the Moves it may make right now."""
    return {
        "phase": game["phase"],
        "you": seat,
        "seats": [
            {"name": s["name"], "gold": s["gold"], "points": s["points"], "hand_size": len(s["hand"])}
            for s in game["seats"]
        ],
        "hand": list(game["seats"][seat]["hand"]),
        "deck_size": len(game["deck"]),
        "discard_size": len(game["discard"]),
        "shared_pool": list(game["shared_pool"]),
        "dice": [dict(d) for d in game["dice"]],
        "current_seat": game["current_seat"],
        "donation": _donation_view(game, seat),
        "legal_moves": legal_moves(game, seat),
    }


def legal_moves(game, seat):
    """The Moves `seat` may make right now."""
    donation = game["donation"]
    if game["phase"] != "donation" or donation is None or seat != game["current_seat"]:
        return []

    if donation["specials"]:
        special = donation["specials"][0]
        if special["type"] == "Both" and donation["direction"] is None:
            return [
                {"type": "choose_direction", "direction": "plus"},
                {"type": "choose_direction", "direction": "minus"},
            ]
        return [
            {"type": "modify_die", "die": i}
            for i in range(len(game["dice"]))
            if i not in donation["dice_chosen"]
        ]

    if not donation["cards"]:
        return []
    moves = []
    if donation["kept"] is None:
        moves.append({"type": "keep"})
    if donation["discarded"] is None:
        moves.append({"type": "discard"})
    if len(donation["donated"]) < _cards_to_draw(game) - 2:
        moves.append({"type": "donate"})
    return moves


def _cards_to_draw(game):
    return len(game["seats"]) + 1


def _start_donation_turn(game):
    """Draw the donor's cards as the React donation phase does: pop from the
    top of the deck until enough non-specials are drawn, setting specials
    aside to be played on the dice first."""
    needed = _cards_to_draw(game)
    drawn, specials = [], []
    while len(drawn) < needed and game["deck"]:
        card = game["deck"].pop()
        (specials if card["isSpecial"] else drawn).append(card)

    if len(drawn) < needed:
        # Not enough cards left for a full donation turn: straight to auction.
        game["phase"] = "auction"
        game["donation"] = None
        return

    game["donation"] = {
        "cards": list(reversed(drawn)),
        "specials": specials,
        "specials_drawn": len(specials),
        "direction": None,
        "dice_chosen": [],
        "kept": None,
        "discarded": None,
        "donated": [],
    }


def _donation_view(game, seat):
    donation = game["donation"]
    if donation is None:
        return None
    view = {"donor": game["current_seat"], "cards_count": len(donation["cards"])}
    if seat == game["current_seat"]:
        view.update(
            {
                "cards": list(donation["cards"]),
                "special": donation["specials"][0] if donation["specials"] else None,
                "specials_drawn": donation["specials_drawn"],
                "direction": donation["direction"],
                "dice_chosen": list(donation["dice_chosen"]),
                "kept": donation["kept"],
                "discarded": donation["discarded"],
                "donated": list(donation["donated"]),
            }
        )
    return view


def _count(settings, key, defaults, value):
    counts = settings.get(key) or defaults
    raw = counts.get(value, counts.get(int(value), 0)) if isinstance(counts, dict) else 0
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return 0


def _build_deck(settings, rng):
    deck = []
    for res in RESOURCE_TYPES:
        for value in DEFAULT_RESOURCE:
            for _ in range(_count(settings, "resource", DEFAULT_RESOURCE, value)):
                deck.append(
                    {"value": int(value), "type": res, "tieBreaker": rng.choice(TIE_BREAKERS), "isSpecial": False}
                )
    for value in DEFAULT_GOLD:
        for _ in range(_count(settings, "gold", DEFAULT_GOLD, value)):
            deck.append({"value": int(value), "type": "Gold", "tieBreaker": "N", "isSpecial": False})
    for value in (1, 2):
        for special in SPECIAL_TYPES:
            deck.append({"value": value, "type": special, "isSpecial": True})
    rng.shuffle(deck)
    return deck
