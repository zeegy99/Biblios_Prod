from flask import Flask, request, jsonify, session, make_response, redirect
from flask_cors import CORS
import psycopg2
import secrets, datetime
import bcrypt
from dotenv import load_dotenv
import os, smtplib, ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import hashlib
import hmac
from typing import NamedTuple
from engine.game import elo_change
load_dotenv()

app = Flask(__name__)

app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
app.config["SECRET_KEY"]=os.getenv("SECRET_KEY")

REGISTRANTS = {}

app.config["SESSION_COOKIE_SAMESITE"] = "None"
app.config["SESSION_COOKIE_SECURE"] = True
app.secret_key = "dev_only_change_me_please_32chars_min"

def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

def hash_function(curr_pass):
    combined = curr_pass.encode()
    a = bcrypt.hashpw(combined, bcrypt.gensalt()) 
    return (a.decode())
    


CORS(app, resources={r"/api/*": {"origins": ["https://biblios-game-frontend.onrender.com", "http://localhost:5173", "https://playbiblios.com"]}}, 
     supports_credentials=True, allow_headers=["Content-Type"], methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]) 





DATABASE_URL = os.getenv("DATABASE_URL")

#Fully unittested and integration tested
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

class SessionAccount(NamedTuple):
    """The account a valid Session belongs to."""
    user_id: int
    username: str

def get_session_account(sid):
    """Looks up the Session for a sid. Returns the SessionAccount for a valid Session,
    or None when the sid is missing, unknown or expired. Database errors propagate.

    A missing sid and an unknown/expired one both return None, so callers that want a
    distinct "no sid" error must check the cookie themselves before calling this."""
    if not sid:
        return None

    conn = psycopg2.connect(DATABASE_URL)
    try:
        cursor = conn.cursor()
        try:
            cursor.execute("""SELECT s.user_id, u.username
                            from sessions s
                           join users u
                           ON s.user_id = u.id
                           where s.session_id = %s and s.expires_at > NOW()
                           """, (sid,))
            row = cursor.fetchone()
        finally:
            cursor.close()
    finally:
        conn.close()

    if not row:
        return None
    return SessionAccount(*row)

def require_session_account():
    """The Session gate for endpoints that need a Signed-in Player.

    Returns (account, None) when the request's sid cookie names a valid Session, or
    (None, error_response) otherwise; the caller returns error_response as-is:
      - no sid cookie                  -> 401 "Not authenticated"
      - the lookup raises              -> 500 with the error message
      - sid unknown or expired         -> 401 "Session expired or invalid"
    """
    sid = request.cookies.get('sid')
    if not sid:
        return None, (jsonify({"error": "Not authenticated"}), 401)

    try:
        account = get_session_account(sid)
    except Exception as e:
        return None, (jsonify({"error": str(e)}), 500)

    if not account:
        return None, (jsonify({"error": "Session expired or invalid"}), 401)

    return account, None

@app.route("/api/current-user", methods=["GET", "OPTIONS"])
def current_user():
    if request.method == "OPTIONS":
        return '', 200

    account, error = require_session_account()
    if error:
        return error

    return jsonify({
        "username": account.username,
        "user_id": account.user_id,
        "authenticated": True
    }), 200
    

def sid_cookie_attributes():
    """The attributes the sid cookie is set with. Sign-out must clear it with the same
    ones, or the browser keeps the original cookie."""
    is_local = 'localhost' in request.host or '127.0.0.1' in request.host
    return {
        "httponly": True,
        "secure": not is_local,                     # HTTPS in production
        "samesite": "Lax" if is_local else "None",  # the frontend is on a different site in production
        "path": "/",
        "domain": None,
    }

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
            SELECT password_hash, id FROM users WHERE username = %s
        """, (username,))
        row = cursor.fetchone()

        if row:
            stored_hash = row[0]
            user_id = row[1]
            is_valid = bcrypt.checkpw(password.encode(), stored_hash.encode())

            if is_valid:

                #Add a token into table sessions
                raw_token = secrets.token_urlsafe(32)
                print("this is what raw_token is", raw_token)
                time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
                cursor.execute("""insert into sessions (session_id, user_id, expires_at) values (%s, %s, %s)""", (raw_token, user_id, time))
                #Clean up this account's expired sessions so the table stays bounded
                cursor.execute("""delete from sessions where user_id = %s and expires_at <= NOW()""", (user_id,))
                conn.commit()

                cursor.execute("SELECT elo_score FROM elo WHERE username = %s", (username,))
                elo_row = cursor.fetchone()
                elo = elo_row[0] if elo_row else 1000

                cursor.close()
                conn.close()

                resp = make_response(jsonify({"message": "Login successful", "elo": elo}))
                
                print(f"=== COOKIE DEBUG ===")
                print(f"Token to set: {raw_token}")
                print(f"Request origin: {request.headers.get('Origin')}")
                print(f"Request host: {request.headers.get('Host')}")

                resp.set_cookie("sid", raw_token, max_age=7*24*3600, **sid_cookie_attributes())
                return resp
                

            else:
                return jsonify({"error": "Invalid username or password"}), 401
        else:
            return jsonify({"error": "Invalid username or password"}), 401

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/signout", methods=["POST", "OPTIONS"])
def signout():
    if request.method == "OPTIONS":
        return '', 200

    # Ends only this Session; the account's other Sessions stay valid.
    # A missing, unknown or expired Session still counts as signed out.
    sid = request.cookies.get('sid')
    if sid:
        try:
            conn = psycopg2.connect(DATABASE_URL)
            try:
                cursor = conn.cursor()
                try:
                    cursor.execute("DELETE FROM sessions WHERE session_id = %s", (sid,))
                    conn.commit()
                finally:
                    cursor.close()
            finally:
                conn.close()
        except Exception as e:
            # Keep the cookie: the Session may still be valid, so the player can retry
            return jsonify({"error": str(e)}), 500

    resp = make_response(jsonify({"message": "Signed out"}))
    resp.delete_cookie("sid", **sid_cookie_attributes())
    return resp


@app.route("/api/update_elo", methods=["POST"])
def update_elo():
    """Gone since #57: Elo changes only through finished server-rules Games,
    which Node reports to /api/internal/game_result. Kept so that a client
    still running an old bundle gets a clear refusal; it touches nothing.
    Safe to delete outright (with its tests) once no browser can still hold
    a bundle from before #57, e.g. a release or two later."""
    return jsonify({"error": "Elo is applied by the game server; this endpoint is gone"}), 410


def game_result_secret_error():
    """The gate for Node's internal Game results endpoint: Node proves itself
    with the shared secret GAME_RESULT_SECRET in the X-Game-Result-Secret
    header, not with a Session. Returns an error response, or None if the
    secret matches. With no secret configured nothing is accepted."""
    expected = os.getenv("GAME_RESULT_SECRET")
    if not expected:
        return jsonify({"error": "Game results are not configured"}), 503
    given = request.headers.get("X-Game-Result-Secret") or ""
    if not hmac.compare_digest(given.encode(), expected.encode()):
        return jsonify({"error": "Not authenticated"}), 401
    return None


@app.route("/api/internal/game_result", methods=["POST"])
def record_game_result_route():
    """Node reports a finished Game: {game_id, placings: [{player_id, rank}]}.
    Applies the Elo formula (the engine's, the same one every Seat was
    shown) to each Signed-in Player ("user:<id>") by place; Guests take
    their places but have no Elo."""
    error = game_result_secret_error()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    game_id, placings = data.get("game_id"), data.get("placings")
    if not isinstance(game_id, str) or not game_id or not valid_placings(placings):
        return jsonify({"error": "Send a game_id and placings ranking every Seat 1..n"}), 400

    try:
        return record_game_result(game_id, placings)
    except Exception:
        # Logged here; the caller only learns that it failed (and may retry).
        app.logger.exception("Could not record the result of Game %s", game_id)
        return jsonify({"error": "Could not record the Game result"}), 500


def record_game_result(game_id, placings):
    """Records the Game id and applies its Elo changes in one transaction;
    a Game id already recorded changes nothing."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        cursor = conn.cursor()
        try:
            # Recording the Game id first, in the same transaction as the Elo
            # changes, makes a repeat report (even a concurrent one) a no-op.
            cursor.execute(
                "INSERT INTO game_results (game_id) VALUES (%s) ON CONFLICT DO NOTHING RETURNING game_id",
                (game_id,)
            )
            if cursor.fetchone() is None:
                return jsonify({"recorded": False}), 200
            for placing in placings:
                user_id = signed_in_user_id(placing.get("player_id"))
                if user_id is None:
                    continue
                cursor.execute(
                    """UPDATE elo SET elo_score = elo_score + %s
                       FROM users WHERE users.id = %s AND elo.username = users.username""",
                    (elo_change(placing["rank"] - 1, len(placings)), user_id)
                )
            conn.commit()
        finally:
            cursor.close()
    finally:
        conn.close()
    return jsonify({"recorded": True}), 200


def valid_placings(placings):
    """Whether `placings` is a list of {player_id, rank} ranking its Seats
    1..n, each rank once, each Player Identity (a string) once."""
    if not isinstance(placings, list) or not placings:
        return False
    if not all(isinstance(p, dict) and type(p.get("rank")) is int and isinstance(p.get("player_id"), str) for p in placings):
        return False
    if len({p["player_id"] for p in placings}) != len(placings):
        return False
    return sorted(p["rank"] for p in placings) == list(range(1, len(placings) + 1))


def signed_in_user_id(player_id):
    """The user id in a Signed-in Player's Player Identity ("user:<id>"), or
    None for a Guest or anything else."""
    if not isinstance(player_id, str) or not player_id.startswith("user:"):
        return None
    raw = player_id[len("user:"):]
    return int(raw) if raw.isascii() and raw.isdigit() else None


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
        sent_email = (data.get("email") or "").strip().lower()
        if not sent_email:
            return jsonify({"message": "If that email exists, we sent a reset code."}), 200

        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cur = conn.cursor()

        # Find user (keep response generic either way)
        cur.execute("SELECT id, username FROM users WHERE LOWER(email) = %s", (sent_email,))
        row = cur.fetchone()

        # Create table to store codes (hash only)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_codes (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                code_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                used_at TIMESTAMPTZ,
                attempts INT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        if row:
            user_id, username = row

            # Optional: invalidate any active codes for this user
            cur.execute("""
                UPDATE password_reset_codes
                SET used_at = NOW()
                WHERE user_id = %s AND used_at IS NULL AND expires_at > NOW()
            """, (user_id,))

            # Generate a 6-digit code and store its hash with 1h expiry
            code = str(secrets.randbelow(1_000_000)).zfill(6)
            code_hash = sha256(code)
            expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=1)

            cur.execute("""
                INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
                VALUES (%s, %s, %s)
            """, (user_id, code_hash, expiry))
            conn.commit()

            # Email the code and a link to your reset page (no token in URL)
            try:
                sender = "fred.yuan392@gmail.com"
                rcpt = sent_email
                pwd = (os.getenv("APP_PASSWORD") or "").strip()
                reset_link = "https://playbiblios.com/reset-password"

                msg = MIMEMultipart("alternative")
                msg["From"] = sender
                msg["To"] = rcpt
                msg["Subject"] = "Your Biblios password reset code"

                txt = (
                    f"Hi {username},\n\n"
                    f"Your password reset code is: {code}\n"
                    f"It expires in 1 hour.\n\n"
                    f"Go to: {reset_link}"
                )
                html = (
                    f"<p>Hi {username},</p>"
                    f"<p>Your password reset code is <b>{code}</b> (expires in 1 hour).</p>"
                    f'<p>Go here to reset: <a href="{reset_link}">Reset Password</a></p>'
                )
                msg.attach(MIMEText(txt, "plain"))
                msg.attach(MIMEText(html, "html"))

                context = ssl.create_default_context()
                with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as s:
                    s.ehlo(); s.starttls(context=context); s.ehlo()
                    s.login(sender, pwd)
                    s.sendmail(sender, rcpt, msg.as_string())
            except Exception:
              
                pass

        cur.close(); conn.close()
        return jsonify({"message": "If that email exists, we sent a reset code."}), 200

    except Exception:
        # Keep response generic
        return jsonify({"message": "If that email exists, we sent a reset code."}), 200


@app.route("/api/change_password", methods=["POST", "OPTIONS"])
def change_password():
    if request.method == "OPTIONS":
        return "", 200
    conn = None
    cursor = None
    try:
        data = request.json
        raw_hash = data.get("code")
        code_hash = sha256(raw_hash)
        sent_password = data.get("password")
        hashed_password = hash_function(sent_password)

        if not code_hash or not sent_password:
            return jsonify({"error": "Missing code or password"}), 400

        #First check if there is something in the database to warrant a change.
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        cursor.execute("""select user_id from password_reset_codes where code_hash like %s""", (code_hash,))

        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Invalid or expired code"}), 400

        print("This is row", row)

        if row:
            cursor.execute("""UPDATE users set password_hash = %s where id = %s""", (hashed_password,row[0]))
            cursor.execute(
            "DELETE FROM password_reset_codes WHERE code_hash = %s",
            (code_hash,),
        )
            conn.commit()
            return '', 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route("/api/send_keybinds", methods=["POST", "OPTIONS"])
def send_keybinds():
    if request.method == "OPTIONS":
        return "", 200

    account, error = require_session_account()
    if error:
        return error

    # The account comes from the Session; any "name" in the body is ignored.
    username = account.username

    conn = None  # Initialize conn to None
    cursor = None

    try:
        data = request.json
        print("Received keybinds data:", data)

        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

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
