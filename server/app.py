from flask import Flask, request, jsonify, session, make_response
from flask_cors import CORS
import psycopg2
import os
import bcrypt
from dotenv import load_dotenv
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
    
    data = request.json
    sent_email = data.get("email").strip()

    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        print("I am making it inside")

        cursor.execute("""SELECT email from users where email like %s""", (sent_email,))

        success = cursor.fetchone() is not None
        if success:
            pass

        print("this is what success is", success)
        print("this is what email is", sent_email)
        cursor.close()
        conn.close()

        return jsonify({"exists": success}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

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
