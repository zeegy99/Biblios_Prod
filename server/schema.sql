CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS elo (
    username TEXT PRIMARY KEY REFERENCES users(username),
    elo_score INTEGER NOT NULL DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS keybinds (
    username TEXT PRIMARY KEY REFERENCES users(username),
    donate_card TEXT,
    discard_card TEXT,
    keep_card TEXT,
    open_chat TEXT,
    bid_increase TEXT,
    bid_decrease TEXT,
    pass_bid TEXT,
    take_card_1 TEXT,
    take_card_2 TEXT,
    take_card_3 TEXT,
    take_card_4 TEXT,
    place_bid TEXT,
    update_dice_1 TEXT,
    update_dice_2 TEXT,
    update_dice_3 TEXT,
    update_dice_4 TEXT,
    update_dice_5 TEXT,
    update_dice_6 TEXT,
    increase_dice TEXT,
    decrease_dice TEXT
);

-- Games whose result Node has reported and whose Elo changes were applied:
-- a repeat report for the same Game id changes nothing (#53).
CREATE TABLE IF NOT EXISTS game_results (
    game_id TEXT PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
