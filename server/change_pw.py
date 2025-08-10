import psycopg2
import bcrypt
import os

DATABASE_URL = os.getenv("DATABASE_URL")

def hash_function(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

cursor.execute("SELECT username, password_hash FROM users")
rows = cursor.fetchall()

for username, current_pass in rows:
    if not current_pass.startswith("$2b$"):  # Skip if already hashed
        new_hash = hash_function(current_pass)
        cursor.execute(
            "UPDATE users SET password_hash = %s WHERE username = %s",
            (new_hash, username)
        )

conn.commit()
cursor.close()
conn.close()

print("✅ Passwords re-hashed")
