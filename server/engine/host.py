"""Runs the Game engine as a child process of the Node socket server (ADR-0002).

Reads one JSON request per line on stdin and writes one JSON response per line
on stdout, echoing the request's `id`. Games live only in this process's memory.

Requests:
  {"id", "op": "create_game", "game_id", "seats", "deck_settings", "seed", "now"}
      -> {"id", "ok": true, "views": [Player View per Seat]}
  {"id", "op": "apply_move", "game_id", "seat", "move"}
      -> {"id", "ok": true, "views": [Player View per Seat]} if the Move is legal
      -> {"id", "ok": true, "rejected": "<reason>"} if not (the Game is unchanged)
When a Game is over, its response also carries
  "ended": {"placings": [{"player_id", "rank"}]} (rank order), exactly once:
the Game is then dropped from memory, so no later request can end it again.
Failures -> {"id", "ok": false, "error": "<reason>"}
"""

import json
import sys

from engine import apply_move, create_game, game_result, player_view


def handle(games, request):
    op = request.get("op")
    if op == "create_game":
        game_id = request["game_id"]
        if game_id in games:
            raise ValueError(f"Game {game_id} already exists")
        game = create_game(request["seats"], request.get("deck_settings"), request["seed"], request["now"])
        return _store(games, game_id, game)
    if op == "apply_move":
        game_id = request["game_id"]
        if game_id not in games:
            raise ValueError(f"No Game {game_id}")
        game, reason = apply_move(games[game_id], request["seat"], request["move"])
        if reason:
            return {"rejected": reason}
        return _store(games, game_id, game)
    raise ValueError(f"Unknown op: {op}")


def _store(games, game_id, game):
    """Keep `game` as the Game `game_id` and answer with its Player Views,
    or, if it is over, forget it and answer with its result too."""
    response = {"views": _views(game)}
    ended = game_result(game)
    if ended:
        games.pop(game_id, None)
        response["ended"] = ended
    else:
        games[game_id] = game
    return response


def _views(game):
    return [player_view(game, seat) for seat in range(len(game["seats"]))]


def main():
    games = {}
    for line in sys.stdin:
        if not line.strip():
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            response = {"id": request_id, "ok": True, **handle(games, request)}
        except Exception as e:  # report every failure to Node rather than dying
            response = {"id": request_id, "ok": False, "error": str(e)}
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
