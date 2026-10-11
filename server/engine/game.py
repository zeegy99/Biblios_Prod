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
# How a Seat bids on the card at auction.
AUCTION_MOVES = ["bid", "pass"]
# How the winner of the card at auction pays for it.
PAYMENT_MOVES = ["pay"]

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
        "auction": None,
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
        "auction": _auction_view(game),
        "legal_moves": legal_moves(game, seat),
    }


def legal_moves(game, seat):
    """The Moves `seat` may make right now."""
    if not _is_index(seat, len(game["seats"])):
        return []
    if game["phase"] == "auction" and game["auction"]["winner"] is not None:
        # A payment is a choice of cards from the hand, so rather than one
        # Move per set of cards the winner is told what the set must be.
        # Whether it may pay at all is _payer_rejection, the same check
        # _rejection makes before looking at the cards of an actual pay Move.
        if _payer_rejection(game, seat) is not None:
            return []
        return [_payment_descriptor(game)]
    if game["phase"] == "auction":
        # A bid is any whole number in a range, so it is listed as that range
        # rather than one Move per amount; both ends are checked by
        # _rejection like any other Move, and every amount between them is
        # legal too.
        moves = []
        low, high = _bid_range(game, seat)
        if all(_rejection(game, seat, {"type": "bid", "amount": a}) is None for a in (low, high)):
            moves.append({"type": "bid", "min": low, "max": high})
        if _rejection(game, seat, {"type": "pass"}) is None:
            moves.append({"type": "pass"})
        return moves

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
    if move["type"] == "bid":
        _bid(game, seat, move["amount"])
        return game, None
    if move["type"] == "pass":
        _pass(game, seat)
        return game, None
    if move["type"] in PAYMENT_MOVES:
        _pay(game, seat, move["cards"])
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
    if not isinstance(move, dict) or move.get("type") not in DONATION_MOVES + SPECIAL_MOVES + SELECTION_MOVES + AUCTION_MOVES + PAYMENT_MOVES:
        return "Unknown Move"
    if not _is_index(seat, len(game["seats"])):
        return "You have no Seat in this Game"
    if move["type"] in SELECTION_MOVES:
        return _selection_rejection(game, seat, move)
    if move["type"] in AUCTION_MOVES:
        return _auction_rejection(game, seat, move)
    if move["type"] in PAYMENT_MOVES:
        return _payment_rejection(game, seat, move)
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
    if not _is_index(die, len(game["dice"])):
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
    if not _is_index(card, len(game["shared_pool"])):
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
    if the deck no longer holds a full draw, the Game goes to the auction.

    React also hands the auction last_donor + 1 (auctionStarterIndex), but
    never uses it: the bidding order comes from auctionTurnOffset alone, so
    Seat 0 bids first on the first card (see _start_auction)."""
    game["shared_pool"] = []
    game["current_seat"] = (game["last_donor"] + 1) % len(game["seats"])
    if len(game["deck"]) < _cards_to_draw(game):
        # React checks the deck before drawing, so nothing more is drawn.
        _start_auction(game)
        return
    game["phase"] = "donation"
    _start_donation_turn(game)


def _start_auction(game):
    """As the React auction phase: the discard pile is auctioned one card at
    a time, front first, with every Seat bidding on each card. The bidding
    order is the Seats rotated by an offset that starts at 0 and moves on by
    one after every card. With nothing discarded there is nothing to
    auction, and the Game goes straight to scoring (React's `!currentCard`)."""
    game["auction"] = {"offset": 0, "last_payment": None}
    if not game["discard"]:
        game["phase"] = "scoring"
        return
    game["phase"] = "auction"
    _open_bidding(game)


def _open_bidding(game):
    """Every Seat is back in for the card at the front of the discard pile,
    with no bid yet, and the first Seat in the bidding order to bid."""
    auction = game["auction"]
    auction.update({"active": [True] * len(game["seats"]), "bid": 0, "highest_bidder": None, "winner": None})
    game["current_seat"] = auction["offset"]


def _auction_rejection(game, seat, move):
    """Why `seat` may not bid or pass right now, or None if it may (the
    React auction phase's Bid and Pass buttons)."""
    if game["phase"] != "auction":
        return "It is not the auction phase"
    auction = game["auction"]
    if auction["winner"] is not None:
        return f"{game['seats'][auction['winner']['seat']]['name']} has won this card and must pay first"
    if not auction["active"][seat]:
        return "You have passed on this card"
    if seat != game["current_seat"]:
        return "It is not your turn to bid"
    if move["type"] == "pass":
        return None
    amount = move.get("amount")
    if not isinstance(amount, int) or isinstance(amount, bool):
        return "Bid a whole number"
    low, high = _bid_range(game, seat)
    if amount < low:
        return f"Bid at least {low}"
    if amount > high:
        if _paid_in_cards(game):
            return f"You may bid at most {high}: the cards in your hand"
        return f"You may bid at most {high}: the gold you have"
    return None


def _bid_range(game, seat):
    """The lowest and highest bid `seat` may make, as the React auction
    phase's handleBid: at least 1 and more than the current bid; at most the
    Seat's gold, or for a Gold card (paid for in cards) its hand size."""
    holder = game["seats"][seat]
    high = len(holder["hand"]) if _paid_in_cards(game) else holder["gold"]
    return game["auction"]["bid"] + 1, high


def _paid_in_cards(game):
    """Whether the card at auction is paid for in cards from the hand (a
    Gold card) rather than in gold (any other card), as in React's payment."""
    return game["discard"][0]["type"] == "Gold"


def _bid(game, seat, amount):
    """As handleBid: the Seat becomes the highest bidder; if it is the only
    Seat still in, it wins the card, otherwise the turn passes to the next
    Seat still in."""
    auction = game["auction"]
    auction["bid"] = amount
    auction["highest_bidder"] = seat
    if sum(auction["active"]) == 1:
        _win(game, seat)
    else:
        _next_bidder(game, seat)


def _pass(game, seat):
    """As handlePass: the Seat is out of the bidding for this card. If no
    Seat is left in, or one is left and someone has bid, the card goes to
    the highest bidder (React's finishAuction), or, with no bid, to no one."""
    auction = game["auction"]
    auction["active"][seat] = False
    still_in = sum(auction["active"])
    has_bid = auction["highest_bidder"] is not None
    if still_in == 0 and not has_bid:
        _discard_unsold(game)
    elif still_in == 0 or (still_in == 1 and has_bid):
        _win(game, auction["highest_bidder"])
    else:
        _next_bidder(game, seat)


def _win(game, seat):
    """`seat` has won the card at auction for the current bid, and the Game
    waits for it to pay. Until then no Seat may bid. As React's
    finishAuction, a Gold card is the winner's at once (into the hand, its
    value onto the gold), before it pays for it in cards; any other card
    joins the hand only once it is paid for (see _pay)."""
    auction = game["auction"]
    # The card won is still the one at the front of the discard pile.
    auction["winner"] = {"seat": seat, "bid": auction["bid"]}
    game["current_seat"] = seat
    card = game["discard"][0]
    if _paid_in_cards(game):
        winner = game["seats"][seat]
        winner["hand"].append(dict(card))
        winner["gold"] += card["value"]
        # The won card is the last in the hand, and may not pay for itself.
        auction["won_index"] = len(winner["hand"]) - 1


def _payer_rejection(game, seat):
    """Why `seat` may not pay for a card right now, or None if it may: only
    the winner of the card at auction pays, and only once it has won."""
    if game["phase"] != "auction":
        return "It is not the auction phase"
    winner = game["auction"]["winner"]
    if winner is None:
        return "No one has won the card yet"
    if seat != winner["seat"]:
        return f"Only {game['seats'][winner['seat']]['name']} pays for this card"
    return None


def _payment_descriptor(game):
    """What the winner's payment must be: for a Gold card exactly `bid`
    cards from the hand other than the Gold card just won; for any other
    card Gold cards from the hand worth at least `bid`."""
    auction = game["auction"]
    bid = auction["winner"]["bid"]
    if _paid_in_cards(game):
        return {"type": "pay", "pay_in": "cards", "exactly": bid, "excluding": [auction["won_index"]]}
    return {"type": "pay", "pay_in": "gold", "at_least": bid}


def _payment_rejection(game, seat, move):
    """Why `seat` may not pay with the hand cards `move["cards"]` (indices
    into its own hand), or None if it may (React's confirmCardPayment and
    confirmGoldPayment, whose checks the server now makes)."""
    reason = _payer_rejection(game, seat)
    if reason:
        return reason
    hand = game["seats"][seat]["hand"]
    cards = move.get("cards")
    if not isinstance(cards, list) or not all(_is_index(i, len(hand)) for i in cards):
        return "Choose cards from your hand"
    if len(set(cards)) != len(cards):
        return "Choose each card only once"
    descriptor = _payment_descriptor(game)
    if descriptor["pay_in"] == "cards":
        if any(i in descriptor["excluding"] for i in cards):
            return "The Gold card you won cannot pay for itself"
        if len(cards) != descriptor["exactly"]:
            return f"Choose exactly {descriptor['exactly']} card(s)"
        return None
    if any(hand[i]["type"] != "Gold" for i in cards):
        return "Pay with Gold cards only"
    total = sum(hand[i]["value"] for i in cards)
    if total < descriptor["at_least"]:
        return f"Your Gold cards come to {total}: pay at least {descriptor['at_least']}"
    return None


def _pay(game, seat, cards):
    """As React's payment: the chosen cards leave the Game, the gold among
    them leaves the Seat's gold (no change is given), a card other than
    Gold joins the hand (a Gold card already has, in _win), and the next
    card goes up."""
    payer = game["seats"][seat]
    paid = [payer["hand"][i] for i in cards]
    payer["hand"] = [c for i, c in enumerate(payer["hand"]) if i not in cards]
    gold = sum(c["value"] for c in paid if c["type"] == "Gold")
    payer["gold"] -= gold
    if _paid_in_cards(game):
        # React posts the cards given up to the Room's chat, so every Seat
        # sees them; which Gold cards paid for a card React does not show,
        # only the gold paid.
        game["auction"]["last_payment"] = {"seat": seat, "cards": paid}
    else:
        game["auction"]["last_payment"] = {"seat": seat, "gold": gold}
        payer["hand"].append(dict(game["discard"][0]))
    game["auction"].pop("won_index", None)
    _next_card(game)


def _discard_unsold(game):
    """As finishAuction with no winner: the card leaves the Game, and no
    one paid for it."""
    game["auction"]["last_payment"] = None
    _next_card(game)


def _next_card(game):
    """However the card at auction was resolved, it leaves the discard pile
    and the next card goes up with the bidding order one Seat on (React's
    auctionTurnOffset + 1), or, if that was the last card, the Game goes to
    scoring."""
    game["discard"].pop(0)
    if not game["discard"]:
        game["phase"] = "scoring"
        return
    auction = game["auction"]
    auction["offset"] = (auction["offset"] + 1) % len(game["seats"])
    _open_bidding(game)


def _next_bidder(game, seat):
    """The turn passes to the next Seat after `seat` in the bidding order
    that has not passed on this card (React's getNextActivePlayerIndex; the
    bidding order is a rotation of the Seats, so that is the next Seat)."""
    n, active = len(game["seats"]), game["auction"]["active"]
    nxt = (seat + 1) % n
    while not active[nxt]:
        nxt = (nxt + 1) % n
    game["current_seat"] = nxt


def _auction_view(game):
    """The auction as every Seat sees it: the card at auction is face up,
    as React shows it to everyone; the rest of the discard pile is only
    its size."""
    auction = game["auction"]
    if game["phase"] != "auction" or auction is None:
        return None
    n = len(game["seats"])
    card = dict(game["discard"][0])
    winner = auction["winner"]
    return {
        "card": card,
        "pay_in": "cards" if _paid_in_cards(game) else "gold",
        "bidding_order": [(auction["offset"] + i) % n for i in range(n)],
        "active": list(auction["active"]),
        "bid": auction["bid"],
        "highest_bidder": auction["highest_bidder"],
        "winner": {**winner, "card": dict(card)} if winner else None,
        # How the previous card was paid for, if it was.
        "last_payment": copy.deepcopy(auction["last_payment"]),
    }


def _is_index(value, size):
    """Whether a Move field `value` is a real index into a list of `size`
    (an int, not a bool, in range), so malformed values never raise."""
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value < size


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
        game["donation"] = None
        _start_auction(game)
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
