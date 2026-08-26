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

@app.route("/api/current-user", methods=["GET", "OPTIONS"])
def current_user():
    if request.method == "OPTIONS":
        return '', 200
    
    sid = request.cookies.get('sid')
    if not sid:
        return jsonify({"error": "Not authenticated"}), 401
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        cursor.execute("""SELECT s.user_id, u.username
                        from sessions s
                       join users u
                       ON s.user_id = u.id
                       where s.session_id = %s and s.expires_at > NOW()
                       """, (sid,))
        
        row = cursor.fetchone()

        if row:
            user_id, username = row
            cursor.close()
            conn.close()
            return jsonify({
                "username": username,
                "user_id": user_id,
                "authenticated": True
            }), 200
        else:
            cursor.close()
            conn.close()
            return jsonify({"error": "Session expired or invalid"}), 401

    except Exception as e:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
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

                is_local = 'localhost' in request.host or '127.0.0.1' in request.host

                resp.set_cookie(
                    "sid", raw_token,
                    httponly=False,
                    secure=not is_local,       # set True in production (HTTPS)
                    samesite="Lax" if is_local else "None",     # use "None" if your frontend is on a different site
                    max_age=7*24*3600,
                    path="/",
                    domain=None,
                )
                return resp
                

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
    data = request.json
    username = data.get("username", "").strip()
    elo_change = data.get("eloChange")

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
                reset_link = "https://biblios-game-frontend.onrender.com/reset-password"

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
