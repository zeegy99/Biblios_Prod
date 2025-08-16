from flask import Flask, request, jsonify, session, make_response
from flask_cors import CORS
import psycopg2
import secrets, datetime
import bcrypt
from dotenv import load_dotenv
import os, smtplib, ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import hashlib
load_dotenv()

print("at the very start of app.py")
app = Flask(__name__)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False
app.secret_key = "dev_only_change_me_please_32chars_min"


def hash_function(curr_pass):
    combined = curr_pass.encode()
    a = bcrypt.hashpw(combined, bcrypt.gensalt()) 
    return (a.decode())
    
# CORS setup for frontend


CORS(app, resources={r"/api/*": {"origins": ["https://biblios-game-frontend.onrender.com", "http://localhost:5173"]}}, 
     supports_credentials=True) 


#https://biblios-game-frontend.onrender.com
# CORS(app, resources={r"/api/*": {"origins": ["https://biblios-game-frontend.onrender.com", "http://localhost:5173"]}}, supports_credentials=True) #https://biblios-game-frontend.onrender.com
# CORS(app, resources={r"/api/*": {"origins": [
#     "http://localhost:5173",
#     "https://biblios-game-frontend.onrender.com"
# ]}}, supports_credentials=True)

# Use DATABASE_URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

@app.route("/api/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == "OPTIONS":
        return '', 200

    data = request.json
    email = data.get("email")
    username = data.get("username")
    password = data.get("password")

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        # Check for existing user
        cursor.execute("SELECT COUNT(*) FROM users WHERE email = %s OR username = %s", (email, username))
        count = cursor.fetchone()[0]
        if count > 0:
            return jsonify({"error": "Email or username already in use"}), 400

        # Register user
        cursor.execute(
            "INSERT INTO users (email, username, password_hash) VALUES (%s, %s, %s)",
            (email, username, hash_function(password))
        )

        # Add default ELO
        cursor.execute("INSERT INTO elo (username, elo_score) VALUES (%s, %s)", (username, 1000))
        conn.commit()

        return jsonify({"message": "User registered successfully", "elo": 1000}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/signin", methods=["POST", "OPTIONS"])
def signin():
    if request.method == "OPTIONS":
        return '', 200

    data = request.json
    username = data.get("username")
    password = data.get("password")

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT password_hash FROM users WHERE username = %s
        """, (username,))
        row = cursor.fetchone()

        if row:
            stored_hash = row[0]
            is_valid = bcrypt.checkpw(password.encode(), stored_hash.encode())

            if is_valid:

                session["username"] = username
                cursor.execute("SELECT elo_score FROM elo WHERE username = %s", (username,))
                elo_row = cursor.fetchone()
                elo = elo_row[0] if elo_row else 1000

                cursor.close()
                conn.close()
                return jsonify({"message": "Login successful", "elo": elo}), 200

            else:
                return jsonify({"error": "Invalid username or password"}), 401
        else:
            return jsonify({"error": "Invalid username or password"}), 401

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update_elo", methods=["POST", "OPTIONS"])
def update_elo():
    if request.method == "OPTIONS":
        return '', 200
    print("I have been received in updateelo")
    data = request.json
    username = data.get("username", "").strip()
    elo_change = data.get("eloChange")

    print("I am username", username, "I am elo_change", elo_change)

    if username == "none":
        return jsonify({"message": "No username associated with this account"}), 400

    try:
        
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        cursor.execute(
            "UPDATE elo SET elo_score = elo_score + %s WHERE username = %s",
            (elo_change, username)
        )

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"message": "Elo updated"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route("/api/get_elo", methods=["POST", "OPTIONS"])
def get_elo():
    if request.method == "OPTIONS":
        return '', 200
    data = request.json
    username = data.get("username")

    if not username:
        return jsonify({"error": "Missing username"}), 400
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        cursor.execute("SELECT elo_score FROM elo WHERE username = %s", (username,))
        result = cursor.fetchone()

        cursor.close()
        conn.close()

        if result:
            return jsonify({"elo": result[0]}), 200
        else:
            return jsonify({"error": "User not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get_leaderboard", methods=["GET", "OPTIONS"])
def get_leaderboard():
    if request.method == "OPTIONS":
        return '', 200

    limit = request.args.get("limit", default=100, type=int)

    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cur = conn.cursor()

        # Adjust table/column names if yours differ
        cur.execute("""
            SELECT username, elo_score
            FROM elo
            ORDER BY elo_score DESC
            LIMIT %s;
        """, (limit,))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        data = [{"username": r[0], "elo": r[1]} for r in rows]
        return jsonify(data), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@app.route("/api/check_email", methods=["POST", "OPTIONS"])
def check_email():
    if request.method == "OPTIONS":
        return "", 200

    try:
        data = request.get_json(force=True) or {}
        sent_email = (data.get("email") or "").strip()
        if not sent_email:
            return jsonify({"message": "If that email exists, we sent a reset link."}), 200

        # DB conn
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(%s)", (sent_email,))
        row = cursor.fetchone()

      
        reset_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(reset_token.encode()).hexdigest()
        expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=1)

        if row:
            user_id = row[0]

            # Ensure table exists once (ideally run this in a migration)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS password_resets (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token_hash TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    used BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            # Invalidate older tokens for this user (optional but nice)
            cursor.execute("""
                UPDATE password_resets
                SET used = TRUE
                WHERE user_id = %s AND used = FALSE;
            """, (user_id,))

            # Save the new reset token (store the hash only)
            cursor.execute("""
                INSERT INTO password_resets (user_id, token_hash, expires_at, used)
                VALUES (%s, %s, %s, FALSE);
            """, (user_id, token_hash, expiry))
            conn.commit()
            
            # Build link with the **raw** token (only sent by email)
            reset_link = f"https://biblios-game-frontend.onrender.com/reset-password/{reset_token}"

            # Send the email [Functional]
            try:
                sender = "fred.yuan392@gmail.com"
                rcpt = sent_email
                pwd = (os.getenv("APP_PASSWORD") or "").strip()

                msg = MIMEMultipart("alternative")
                msg["From"] = sender
                msg["To"] = rcpt
                msg["Subject"] = "Reset your Biblios password"

                text_part = MIMEText(
                    f"Click this link to reset your password. It expires in 1 hour:\n{reset_link}",
                    "plain",
                )
                html_part = MIMEText(
                    f'Click this link to reset your password (expires in 1 hour): '
                    f'<a href="{reset_link}">Reset Password</a>',
                    "html",
                )
                msg.attach(text_part)
                msg.attach(html_part)

                context = ssl.create_default_context()
                with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as s:
                    # s.set_debuglevel(1)  # enable only while debugging locally
                    s.ehlo()
                    s.starttls(context=context)
                    s.ehlo()
                    s.login(sender, pwd)
                    s.sendmail(sender, rcpt, msg.as_string())
            except Exception:
                # Log internally if you want, but don't change the API response
                pass

        # Clean up
        cursor.close()
        conn.close()

        # Always generic response
        return jsonify({"message": "If that email exists in our system, we sent a reset link."}), 200

    except Exception as e:
        # Still return 200 generic to avoid probing; log e server-side
        return jsonify({"message": "If that email exists, we sent a reset link."}), 200


@app.route("/api/send_keybinds", methods=["POST", "OPTIONS"])
def send_keybinds():
    if request.method == "OPTIONS":
        return "", 200
    
    conn = None  # Initialize conn to None
    cursor = None
    
    try:
        data = request.json
        print("Received keybinds data:", data)

        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()
        
        username = data.get('name')
        if not username:
            return jsonify({"error": "Username not provided"}), 400

        cursor.execute("SELECT username FROM keybinds WHERE username = %s", (username,))
        user_exists = cursor.fetchone() is not None

        if user_exists:
            update_clauses = []
            values_to_update = []
            
            for key, value_list in data['settings'].items():
                if len(value_list) > 0:
                    # FIX: Use the key directly, without quotes, for lowercase column names
                    update_clauses.append(f'{key.lower()} = %s')
                    values_to_update.append(value_list[0])
            
            values_to_update.append(username)
            
            update_query = f"UPDATE keybinds SET {', '.join(update_clauses)} WHERE username = %s"

            cursor.execute(update_query, values_to_update)
            print(f"Updated keybinds for user: {username}")
        
        else:
            column_names = ['username']
            values_list = [username]
            
            for key, value_list in data['settings'].items():
                # FIX: Use the key directly, without quotes
                column_names.append(key.lower())
                values_list.append(value_list[0])
            
            placeholders = ', '.join(['%s'] * len(values_list))

            insert_query = f"INSERT INTO keybinds ({', '.join(column_names)}) VALUES ({placeholders})"
            
            cursor.execute(insert_query, values_list)
            print(f"Inserted new keybinds for user: {username}")

        conn.commit()

        return jsonify({"message": "Keybinds updated successfully"}), 200

    except (psycopg2.Error, Exception) as e:
        print("An error occurred:", e)
        return jsonify({"error": str(e)}), 500
        
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    



    
if __name__ == "__main__":
    app.run(port=5000, debug=True)
