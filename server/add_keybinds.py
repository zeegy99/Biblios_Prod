#Need to create keybinds that are stored

import psycopg2
import bcrypt
import os

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE Keybinds
""")
