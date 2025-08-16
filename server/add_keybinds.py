#Need to create keybinds that are stored

import psycopg2
import bcrypt
import os

DATABASE_URL = os.getenv("DATABASE_URL")