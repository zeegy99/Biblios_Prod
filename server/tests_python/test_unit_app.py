# test_app.py

import pytest
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app, get_session_account, SessionAccount
@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c

@pytest.fixture
def db(mocker):
    """Patches psycopg2.connect with a mock connection; yields (conn, cursor)."""
    conn = mocker.MagicMock()
    cursor = mocker.MagicMock()
    conn.cursor.return_value = cursor
    mocker.patch("app.psycopg2.connect", return_value=conn)
    return conn, cursor

def test_app_exists():
    assert app is not None

class Test_register:
    def test_register_username_or_email_in_use(self, client, mocker):
        conn = mocker.MagicMock()
        cursor = mocker.MagicMock()

        cursor.fetchone.return_value = (1, )
        conn.cursor.return_value = cursor

        mocker.patch("app.psycopg2.connect", return_value = conn)
        resp = client.post("/api/register", json={"email": "testemail@gmail.com", "username": "testusername", "password": "testpassword"})

        assert resp.status_code == 400
        assert resp.get_json()['error'] == "Email or username already in use"

    def test_register_success(self, client, mocker):
        conn = mocker.MagicMock()
        cursor = mocker.MagicMock()

        cursor.fetchone.return_value = (0, )
        conn.cursor.return_value = cursor
        mocker.patch("app.psycopg2.connect", return_value = conn)
        

        resp = client.post("/api/register", json={"email": "a@gmail.com", 'username': 'a', 'password': 'a'})

        
  
        assert resp.status_code == 200
        assert resp.get_json()['message'] == "User registered successfully"

    def test_calls_into_db_are_correct(self, client, mocker):
        conn = mocker.MagicMock()
        cursor = mocker.MagicMock()

        cursor.fetchone.return_value = (0, )
        conn.cursor.return_value = cursor
        mocker.patch("app.psycopg2.connect", return_value = conn)
        mocker.patch("app.hash_function", return_value="fixed")
        resp = client.post("/api/register", json={"email": "a@gmail.com", 'username': 'a', 'password': 'a'})

        cursor.execute.assert_any_call("INSERT INTO users (email, username, password_hash) VALUES (%s, %s, %s)",
            ("a@gmail.com", "a", "fixed"))
        cursor.execute.assert_any_call("SELECT COUNT(*) FROM users WHERE email = %s OR username = %s", ('a@gmail.com', 'a'))
        cursor.execute.assert_any_call("INSERT INTO elo (username, elo_score) VALUES (%s, %s)", ('a', 1000))
        conn.commit.assert_called_once()

class Test_get_session_account:
    def test_missing_sid_returns_none_without_touching_db(self, mocker):
        connect = mocker.patch("app.psycopg2.connect")

        assert get_session_account(None) is None
        assert get_session_account("") is None
        connect.assert_not_called()

    def test_valid_sid_returns_session_account(self, db):
        conn, cursor = db
        cursor.fetchone.return_value = (7, "alice")

        account = get_session_account("good-sid")

        assert account == SessionAccount(user_id=7, username="alice")
        assert account.user_id == 7
        assert account.username == "alice"
        cursor.close.assert_called_once()
        conn.close.assert_called_once()

    def test_unknown_or_expired_sid_returns_none(self, db):
        conn, cursor = db
        cursor.fetchone.return_value = None

        assert get_session_account("stale-sid") is None
        cursor.close.assert_called_once()
        conn.close.assert_called_once()

    def test_db_error_propagates_and_closes_cursor_and_connection(self, db):
        conn, cursor = db
        cursor.execute.side_effect = Exception("db down")

        with pytest.raises(Exception, match="db down"):
            get_session_account("good-sid")
        cursor.close.assert_called_once()
        conn.close.assert_called_once()

class Test_current_user:
    def test_current_user_options_preflight(self, client):
        resp = client.open("/api/current-user", method="OPTIONS")
        assert resp.status_code == 200

    def test_current_user_resolves_sid_through_helper(self, client, mocker):
        helper = mocker.patch("app.get_session_account", return_value=SessionAccount(user_id=7, username="alice"))
        client.set_cookie("sid", "good-sid")

        resp = client.get("/api/current-user")

        helper.assert_called_once_with("good-sid")
        assert resp.status_code == 200
        assert resp.get_json() == {"username": "alice", "user_id": 7, "authenticated": True}

    def test_current_user_no_sid_returns_401(self, client, mocker):
        helper = mocker.patch("app.get_session_account")

        resp = client.get("/api/current-user")

        helper.assert_not_called()
        assert resp.status_code == 401
        assert resp.get_json() == {"error": "Not authenticated"}

    def test_current_user_invalid_session_returns_401(self, client, mocker):
        mocker.patch("app.get_session_account", return_value=None)
        client.set_cookie("sid", "stale-sid")

        resp = client.get("/api/current-user")

        assert resp.status_code == 401
        assert resp.get_json() == {"error": "Session expired or invalid"}

    def test_current_user_db_error_returns_500(self, client, mocker):
        mocker.patch("app.get_session_account", side_effect=Exception("db down"))
        client.set_cookie("sid", "good-sid")

        resp = client.get("/api/current-user")

        assert resp.status_code == 500
        assert resp.get_json() == {"error": "db down"}

class Test_signin:
    def test_signin_options_preflight(self, client):
        resp = client.open("/api/signin", method="OPTIONS")
        assert resp.status_code == 200

    def test_signin_wrong_username(self, client, mocker):
        mock_cursor = mocker.MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn = mocker.MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mocker.patch("app.psycopg2.connect", return_value=mock_conn)

        resp = client.post("/api/signin", json={"username": "abc", "password": "ghi"})

        assert resp.status_code == 401
        assert resp.get_json()["error"] == "Invalid username or password"

    def test_signin_wrong_password(self, client, mocker):

        conn = mocker.MagicMock()
        cursor = mocker.MagicMock()

        conn.cursor.return_value = cursor
        cursor.fetchone.return_value = ('password5hash', 'id')

        mocker.patch("app.psycopg2.connect", return_value=conn)
        mocker.patch("app.bcrypt.checkpw", return_value = False)
        resp = client.post("/api/signin", json={"username": "abc", "password": "ghi"})

        print(resp.get_json())
        assert resp.status_code == 401
        assert resp.get_json()["error"] == "Invalid username or password"

    def test_signin_correct_password(self, client, mocker):
        conn = mocker.MagicMock()
        cursor = mocker.MagicMock()

        cursor.fetchone.return_value = ('password_hash', 'id')
        conn.cursor.return_value = cursor
        mocker.patch('app.psycopg2.connect', return_value=conn)
        mocker.patch('app.bcrypt.checkpw', return_value = True)
        resp = client.post("/api/signin", json={"username": "abc", "password": "ghi"})

        assert resp.get_json()['message'] == "Login successful"
        
class Test_update_elo:
    def test_username_is_none(self, client):

        resp = client.post("/api/update_elo", json={'username': 'none', 'eloChange': 10})
        assert resp.json['message'] == "No username associated with this account"
        assert resp.status_code == 400

    def test_changing_elo(self, client, mocker):
        conn = mocker.MagicMock()
        cursor = mocker.MagicMock()


        conn.cursor.return_value = cursor
        mocker.patch("app.psycopg2.connect", return_value=conn)
        resp = client.post("/api/update_elo", json={'username': 'abc', 'eloChange': 10})

        assert resp.status_code == 200
        assert resp.json['message'] == "Elo updated"

#Adding More Unit-Tests In the Future


