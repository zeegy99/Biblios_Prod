#Need to create keybinds that are stored

import psycopg2
import os

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

cursor.execute("""
    CREATE TABLE keybinds (
    username VARCHAR(32) PRIMARY KEY
    REFERENCES users(username) ON DELETE CASCADE,

    keep_key        TEXT NOT NULL,
    discard_key     TEXT NOT NULL,
    donate_key      TEXT NOT NULL,
    open_chat_key   TEXT NOT NULL,
    bid_increase_key TEXT NOT NULL,
    bid_decrease_key TEXT NOT NULL,
    pass_bid_key     TEXT NOT NULL,
    place_bid_key    TEXT NOT NULL,
    take_card_1_key  TEXT NOT NULL,
    take_card_2_key  TEXT NOT NULL,
    take_card_3_key  TEXT NOT NULL,
    take_card_4_key  TEXT NOT NULL
    );
""")

conn.commit()
cursor.close()
conn.close()
