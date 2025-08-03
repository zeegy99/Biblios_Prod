from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import os

app = Flask(__name__)

# CORS setup for frontend
CORS(app, resources={r"/api/*": {"origins": "https://biblios-game-frontend.onrender.com"}}, supports_credentials=True)
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
            (email, username, password)
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

        cursor.execute(
            "SELECT * FROM users WHERE username = %s AND password_hash = %s",
            (username, password)
        )
        user = cursor.fetchone()

        if user:
            return jsonify({"message": "Login successful"}), 200
        else:
            return jsonify({"error": "Invalid username or password"}), 401

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update_elo", methods=["POST", "OPTIONS"])
def update_elo():
    data = request.json
    username = data.get("username", "").strip()
    elo_change = data.get("eloChange")

    if username == "none":
        return jsonify({"message": "No username associated with this account"}), 400

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        cursor.execute(
            "UPDATE users SET elo = elo + %s WHERE username = %s",
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

        cursor.execute("SELECT elo FROM users WHERE username = %s", (username,))
        result = cursor.fetchone()

        cursor.close()
        conn.close()

        if result:
            return jsonify({"elo": result[0]}), 200
        else:
            return jsonify({"error": "User not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    
if __name__ == "__main__":
    app.run(port=5000, debug=True)
