#Need to create keybinds that are stored

hashmap = {'DONATE_CARD': ['Q'], 'DISCARD_CARD': ['W'], 'KEEP_CARD': ['E'], 'OPEN_CHAT': ['Enter'], 'BID_INCREASE': ['R'], 'BID_DECREASE': ['T'], 'PASS_BID': ['A'], 'TAKE_CARD_1': ['1'], 'TAKE_CARD_2': ['2'], 'TAKE_CARD_3': ['3'], 'TAKE_CARD_4': ['4'], 'PLACE_BID': ['S'], 'UPDATE_DICE_1': ['1'], 'UPDATE_DICE_2': ['2'], 'UPDATE_DICE_3': ['3'], 'UPDATE_DICE_4': ['4'], 'UPDATE_DICE_5': ['5'], 'UPDATE_DICE_6': ['6'], 'INCREASE_DICE': ['I'], 'DECREASE_DICE': ['O']}

import psycopg2
import os

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()


for i in hashmap:
    cursor.execute(f"""ALTER TABLE keybinds ADD COLUMN {i} TEXT NOT NULL""")


conn.commit()
cursor.close()
conn.close()
