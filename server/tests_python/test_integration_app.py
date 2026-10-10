import pytest
import psycopg2
import bcrypt
import datetime
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


os.environ.setdefault("DATABASE_URL", "postgresql://postgres:test@localhost:5432/biblios_database_dev")
os.environ.setdefault("SECRET_KEY", "test-secret-key-doesnt-matter-for-this-test")

from app import app  

@pytest.fixture
def client():

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE users CASCADE")
    conn.commit()
    cur.close()
    conn.close()

@pytest.fixture #existing_user has implicit cleanup from client. Client gets set up -> existing_user -> existing_user cleanup -> client_cleanup
def existing_user(client):
    """Seeds one user before the test runs, cleaned up by client's teardown after."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (email, username, password_hash) VALUES (%s, %s, %s)",
        ("test1@gmail.com", "test_1", "some_password")
    )
    cur.execute(
        "INSERT INTO elo (username, elo_score) VALUES (%s, %s)",
        ("test_1", 900)
    )
    conn.commit()
    cur.close()
    conn.close()
    yield

class Test_register:
    def test_register_creates_user_success(self, client):
        response = client.post("/api/register", json={
            "email": "test@gmail.com", "username": "test_username", "password": "test_password"
        })
        print(response.get_json())
        assert response.status_code == 200

    def test_register_duplicate_email(self, client, existing_user):

        response = client.post("/api/register", json={
            "email": "test1@gmail.com", "username": "test_username", "password": "test1_password"
        })

        assert response.status_code == 400
        assert response.get_json()['error'] == "Email or username already in use"

    def test_register_duplicate_username(self, client, existing_user):
    
            response = client.post("/api/register", json={
                "email": "a@gmail.com", "username": "test_1", "password": "test1_password"
            })
            assert response.status_code == 400
            assert response.get_json()['error'] == "Email or username already in use"
    def test_register_duplicate_password(self, client, existing_user):
    
            response = client.post("/api/register", json={
                "email": "a@gmail.com", "username": "a", "password": "some_password"
            })
        
            assert response.status_code == 200
            assert response.get_json()['message'] == "User registered successfully"

class Test_signin:
     def no_username(self, client, existing_user):
          pass


class Test_signin_expired_session_cleanup:
    PASSWORD = "correct_password"

    def _seed_user(self, cur, username):
        password_hash = bcrypt.hashpw(self.PASSWORD.encode(), bcrypt.gensalt()).decode()
        cur.execute(
            "INSERT INTO users (email, username, password_hash) VALUES (%s, %s, %s) RETURNING id",
            (f"{username}@gmail.com", username, password_hash)
        )
        return cur.fetchone()[0]

    def _seed_session(self, cur, session_id, user_id, expires_at):
        cur.execute(
            "INSERT INTO sessions (session_id, user_id, expires_at) VALUES (%s, %s, %s)",
            (session_id, user_id, expires_at)
        )

    def test_signin_deletes_only_this_accounts_expired_sessions(self, client):
        now = datetime.datetime.now(datetime.timezone.utc)
        past = now - datetime.timedelta(days=1)
        future = now + datetime.timedelta(days=3)

        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        alice_id = self._seed_user(cur, "alice")
        bob_id = self._seed_user(cur, "bob")
        self._seed_session(cur, "alice_expired_1", alice_id, past)
        self._seed_session(cur, "alice_expired_2", alice_id, past - datetime.timedelta(days=30))
        self._seed_session(cur, "alice_other_device", alice_id, future)
        self._seed_session(cur, "bob_expired", bob_id, past)
        self._seed_session(cur, "bob_active", bob_id, future)
        conn.commit()

        response = client.post("/api/signin", json={"username": "alice", "password": self.PASSWORD})
        assert response.status_code == 200

        cur.execute("SELECT session_id FROM sessions WHERE user_id = %s", (alice_id,))
        alice_sessions = {row[0] for row in cur.fetchall()}
        cur.execute("SELECT session_id FROM sessions WHERE user_id = %s", (bob_id,))
        bob_sessions = {row[0] for row in cur.fetchall()}
        cur.close()
        conn.close()

        assert "alice_expired_1" not in alice_sessions
        assert "alice_expired_2" not in alice_sessions
        assert "alice_other_device" in alice_sessions
        assert len(alice_sessions) == 2  # the other device plus the new Session
        assert bob_sessions == {"bob_expired", "bob_active"}

    def test_failed_signin_leaves_expired_sessions(self, client):
        past = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)

        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        alice_id = self._seed_user(cur, "alice")
        self._seed_session(cur, "alice_expired", alice_id, past)
        conn.commit()

        response = client.post("/api/signin", json={"username": "alice", "password": "wrong_password"})
        assert response.status_code == 401

        cur.execute("SELECT session_id FROM sessions WHERE user_id = %s", (alice_id,))
        alice_sessions = {row[0] for row in cur.fetchall()}
        cur.close()
        conn.close()

        assert alice_sessions == {"alice_expired"}
