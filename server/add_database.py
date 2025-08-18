import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

cursor.execute("""CREATE TABLE sessions (
               session_id TEXT PRIMARY KEY NOT NULL,
               user_id BIGINT NOT NULL references users(id) on delete cascade,
               expires_at timestamptz not null 
               );""")

conn.commit()

cursor.close()
conn.close()
