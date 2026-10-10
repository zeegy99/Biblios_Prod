import pytest
import psycopg2
import bcrypt
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


os.environ.setdefault("DATABASE_URL", "postgresql://postgres:test@localhost:5432/biblios_database_dev")
os.environ["SECRET_KEY"] = "test-secret-key-doesnt-matter-for-this-test"

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

@pytest.fixture
def signin_user(client):
    """Seeds a user with a real password hash so tests can sign in through /api/signin."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (email, username, password_hash) VALUES (%s, %s, %s) RETURNING id",
        ("signin@gmail.com", "signin_user", bcrypt.hashpw(b"signin_password", bcrypt.gensalt()).decode())
    )
    user_id = cur.fetchone()[0]
    cur.execute("INSERT INTO elo (username, elo_score) VALUES (%s, %s)", ("signin_user", 1000))
    conn.commit()
    cur.close()
    conn.close()
    yield {"username": "signin_user", "password": "signin_password", "user_id": user_id}

def sign_in(client, user):
    resp = client.post("/api/signin", json={"username": user["username"], "password": user["password"]})
    assert resp.status_code == 200
    return client.get_cookie("sid").value

class Test_current_user:
    def test_valid_session_returns_username_and_user_id(self, client, signin_user):
        sign_in(client, signin_user)

        resp = client.get("/api/current-user")

        assert resp.status_code == 200
        assert resp.get_json() == {
            "username": "signin_user",
            "user_id": signin_user["user_id"],
            "authenticated": True,
        }

    def test_expired_session_returns_401(self, client, signin_user):
        sid = sign_in(client, signin_user)
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute("UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE session_id = %s", (sid,))
        conn.commit()
        cur.close()
        conn.close()

        resp = client.get("/api/current-user")

        assert resp.status_code == 401
        assert resp.get_json() == {"error": "Session expired or invalid"}

    def test_unknown_sid_returns_401(self, client, signin_user):
        client.set_cookie("sid", "not-a-real-session")

        resp = client.get("/api/current-user")

        assert resp.status_code == 401
        assert resp.get_json() == {"error": "Session expired or invalid"}

    def test_no_sid_cookie_returns_401(self, client, signin_user):
        sign_in(client, signin_user)
        client.delete_cookie("sid")

        resp = client.get("/api/current-user")

        assert resp.status_code == 401
        assert resp.get_json() == {"error": "Not authenticated"}

    

    