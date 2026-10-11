"""The Biblios Game engine (ADR-0002).

Pure functions of a Game, a Seat and the time: no I/O, no clock, and all
randomness comes from the seed. The rules are ported from the React
components (frontend_/src/components), which are the canonical rules.

A Game is a plain JSON-serialisable dict; treat it as opaque outside this
module and read it only through player_view.
"""

import copy
import random

# Both orders are the React ones: RESOURCE_TYPES is the deck build order (it
# decides which card a seed shuffles where), DICE_TYPES the order dice are shown.
RESOURCE_TYPES = ["Religion", "Science", "Military", "Art", "Herbs"]
DICE_TYPES = ["Art", "Herbs", "Military", "Religion", "Science"]
TIE_BREAKERS = list("ABCDEFGHIJK")
SPECIAL_TYPES = ["Plus", "Minus", "Both"]
# What the donor may do with each ordinary card it drew.
DONATION_MOVES = ["keep", "discard", "donate"]
# How the donor plays a special card on the dice.
SPECIAL_MOVES = ["choose_direction", "modify_die"]
DIRECTIONS = {"plus": +1, "minus": -1}
# How a Seat takes a card from the shared pool.
SELECTION_MOVES = ["take"]

DEFAULT_RESOURCE = {"1": 5, "2": 4, "3": 2, "4": 2}
DEFAULT_GOLD = {"1": 5, "2": 5, "3": 5}


def create_game(seats, deck_settings, seed, now):
    """A new Game for the given Seats ([{player_id, name}] in turn order),
    with the deck shuffled and the dice rolled from the seed. The first Seat
    starts the donation phase with its cards already drawn. `now` (ms) is
    the start time; the engine never reads the clock."""
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
        "donation": None,
        "last_donor": None,
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
        "last_donor": game["last_donor"],
        "donation": _donation_view(game, seat),
        "legal_moves": legal_moves(game, seat),
    }


def legal_moves(game, seat):
    """The Moves `seat` may make right now."""
    if game["phase"] == "shared_selection":
        candidates = [{"type": "take", "card": i} for i in range(len(game["shared_pool"]))]
        return [m for m in candidates if _rejection(game, seat, m) is None]

    donation = game["donation"]
    if game["phase"] != "donation" or donation is None or seat != game["current_seat"]:
        return []

    if donation["specials"]:
        candidates = [{"type": "choose_direction", "direction": d} for d in DIRECTIONS] + [
            {"type": "modify_die", "die": i} for i in range(len(game["dice"]))
        ]
        return [m for m in candidates if _rejection(game, seat, m) is None]

    return [{"type": t} for t in DONATION_MOVES if _rejection(game, seat, {"type": t}) is None]


def apply_move(game, seat, move):
    """Apply `move` by `seat`. Returns (new Game, None) if it is legal, or
    (None, reason) if it is not; the given Game is never changed. A donation
    Move names no card: it always deals with the donor's current card, the
    only one the donor holds and sees."""
    reason = _rejection(game, seat, move)
    if reason:
        return None, reason
    game = copy.deepcopy(game)
    if move["type"] in SELECTION_MOVES:
        _take(game, seat, move)
        return game, None
    if move["type"] in SPECIAL_MOVES:
        _play_special(game, move)
        return game, None
    donation = game["donation"]
    card = donation["cards"].pop(0)
    if move["type"] == "keep":
        donation["kept"] = card
    elif move["type"] == "discard":
        donation["discarded"] = card
    else:
        donation["donated"].append(card)
        game["shared_pool"].append({**card, "pooledBy": game["seats"][seat]["name"]})
    if not donation["cards"]:
        _finish_donation_turn(game)
    return game, None


def _rejection(game, seat, move):
    """Why `seat` may not make `move` right now, or None if it may."""
    if not isinstance(move, dict) or move.get("type") not in DONATION_MOVES + SPECIAL_MOVES + SELECTION_MOVES:
        return "Unknown Move"
    if not isinstance(seat, int) or not 0 <= seat < len(game["seats"]):
        return "You have no Seat in this Game"
    if move["type"] in SELECTION_MOVES:
        return _selection_rejection(game, seat, move)
    donation = game["donation"]
    if game["phase"] != "donation" or donation is None:
        return "It is not the donation phase"
    if seat != game["current_seat"]:
        return "It is not your turn to donate"
    if move["type"] in SPECIAL_MOVES:
        return _special_rejection(game, move)
    if donation["specials"]:
        return "Play the special card on the dice first"
    if move["type"] == "keep" and donation["kept"] is not None:
        return "You have already kept a card this turn"
    if move["type"] == "discard" and donation["discarded"] is not None:
        return "You have already discarded a card this turn"
    if move["type"] == "donate" and len(donation["donated"]) >= _cards_to_draw(game) - 2:
        return "You have already donated enough cards to the shared pool"
    return None


def _special_rejection(game, move):
    """Why the donor may not make the special-card Move `move` right now, or
    None if it may (the React donation phase's Both choice and dice buttons)."""
    donation = game["donation"]
    if not donation["specials"]:
        return "There is no special card to play"
    special = donation["specials"][0]
    choosing = special["type"] == "Both" and donation["direction"] is None
    if move["type"] == "choose_direction":
        if not choosing:
            return "There is no direction to choose"
        direction = move.get("direction")
        if not isinstance(direction, str) or direction not in DIRECTIONS:
            return "Choose to increase (plus) or decrease (minus) the dice"
        return None
    if choosing:
        return "Choose a direction (increase or decrease) first"
    die = move.get("die")
    if not isinstance(die, int) or isinstance(die, bool) or not 0 <= die < len(game["dice"]):
        return "There is no such die"
    if die in donation["dice_chosen"]:
        return "You have already changed that die with this card"
    return None


def _selection_rejection(game, seat, move):
    """Why `seat` may not take a card from the shared pool right now, or
    None if it may (the React shared selection phase's Take buttons)."""
    if game["phase"] != "shared_selection":
        return "It is not the shared selection phase"
    if seat != game["current_seat"]:
        return "It is not your turn to take a card"
    card = move.get("card")
    if not isinstance(card, int) or isinstance(card, bool) or not 0 <= card < len(game["shared_pool"]):
        return "There is no such card in the shared pool"
    return None


def _take(game, seat, move):
    """As the React shared selection phase's handleChoice: the chosen card
    leaves the shared pool for the Seat's hand (a Gold card adding its value
    to the Seat's gold) and the next Seat chooses."""
    taker = game["seats"][seat]
    card = game["shared_pool"].pop(move["card"])
    taker["hand"].append(card)
    if card["type"] == "Gold":
        taker["gold"] += card["value"]
    _pass_selection_to(game, seat + 1)


def _pass_selection_to(game, seat):
    """The turn to take passes to `seat`, unless that is back at the last
    donor or the shared pool is empty: then the shared selection ends (as
    the React phase calls onFinish), so no Seat is left waiting to take from
    an empty pool."""
    game["current_seat"] = seat % len(game["seats"])
    if game["current_seat"] == game["last_donor"] or not game["shared_pool"]:
        _finish_shared_selection(game)


def _finish_shared_selection(game):
    """As the React game manager's shared selection onFinish: the shared pool
    is cleared and the Seat after the last donor starts a donation turn, or,
    if the deck no longer holds a full draw, the Game goes to the auction."""
    game["shared_pool"] = []
    game["current_seat"] = (game["last_donor"] + 1) % len(game["seats"])
    if len(game["deck"]) < _cards_to_draw(game):
        # React checks the deck before drawing, so nothing more is drawn.
        game["phase"] = "auction"
        return
    game["phase"] = "donation"
    _start_donation_turn(game)


def _play_special(game, move):
    """As the React donation phase's dice buttons: a Both card first takes a
    direction; then each chosen die moves one step (Plus up to 6, Minus down
    to 1). A value-2 card changes two different dice, a value-1 card one.
    Once enough dice are chosen the card is spent and the next special, if
    any, is played the same way."""
    donation = game["donation"]
    special = donation["specials"][0]
    if move["type"] == "choose_direction":
        donation["direction"] = move["direction"]
        return
    direction = {"Plus": "plus", "Minus": "minus"}.get(special["type"], donation["direction"])
    step = DIRECTIONS[direction]
    die = game["dice"][move["die"]]
    die["value"] = min(6, max(1, die["value"] + step))
    donation["dice_chosen"].append(move["die"])
    if len(donation["dice_chosen"]) == (2 if special["value"] == 2 else 1):
        donation["specials"].pop(0)
        donation["direction"] = None
        donation["dice_chosen"] = []


def _finish_donation_turn(game):
    """As the React donation phase's confirmTurn: the kept card joins the
    donor's hand (adding its gold), the discarded card the discard pile, the
    donor is remembered as the last donor, and the next Seat starts the
    shared selection."""
    donation = game["donation"]
    donor = game["seats"][game["current_seat"]]
    kept = donation["kept"]
    donor["hand"].append(kept)
    if kept["type"] == "Gold":
        donor["gold"] += kept["value"]
    game["discard"].append(donation["discarded"])
    game["donation"] = None
    game["last_donor"] = game["current_seat"]
    game["phase"] = "shared_selection"
    _pass_selection_to(game, game["current_seat"] + 1)


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
    view = {
        "donor": game["current_seat"],
        "cards_count": len(donation["cards"]),
        # A special card is played face up on the dice, as at the table, so
        # every Seat sees the one being played and how far it has got.
        "special": donation["specials"][0] if donation["specials"] else None,
        "direction": donation["direction"],
        "dice_chosen": list(donation["dice_chosen"]),
    }
    if seat == game["current_seat"]:
        # The donor deals with one card at a time, so only that card is shown:
        # the rest of the draw is as hidden as the deck it came from.
        view.update(
            {
                "card": donation["cards"][0] if donation["cards"] else None,
                "specials_drawn": donation["specials_drawn"],
                "kept": donation["kept"],
                "discarded": donation["discarded"],
                "donated": list(donation["donated"]),
            }
        )
    return view


def _count(settings, key, defaults, value):
    """How many cards of `value` the deck settings ask for. The lobby sends
    string keys and may send "" for a blank field, which counts as zero."""
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
