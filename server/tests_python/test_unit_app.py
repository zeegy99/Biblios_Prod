# test_app.py

import pytest
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app, get_session_account, SessionAccount, sha256, MAX_RESET_ATTEMPTS
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
    """Elo comes only from finished server-rules Games (#53); since #57 the
    client-facing endpoint refuses every request and touches nothing."""

    def test_signed_in_request_is_refused_with_410_and_changes_nothing(self, client, mocker):
        helper = mocker.patch("app.get_session_account", return_value=SessionAccount(user_id=7, username="alice"))
        connect = mocker.patch("app.psycopg2.connect")
        client.set_cookie("sid", "good-sid")

        resp = client.post("/api/update_elo", json={'eloChange': 10})

        assert resp.status_code == 410
        assert "error" in resp.get_json()
        helper.assert_not_called()
        connect.assert_not_called()

    def test_request_without_session_is_refused_with_410(self, client, mocker):
        connect = mocker.patch("app.psycopg2.connect")

        resp = client.post("/api/update_elo", json={'username': 'mallory', 'eloChange': 10})

        assert resp.status_code == 410
        connect.assert_not_called()

class Test_change_password:
    BODY = {"email": "alice@gmail.com", "code": "123456", "password": "new_password"}

    def test_options_preflight(self, client):
        resp = client.open("/api/change_password", method="OPTIONS")
        assert resp.status_code == 200

    @pytest.mark.parametrize("body", [
        {},
        {"email": "alice@gmail.com", "password": "new_password"},
        {"email": "alice@gmail.com", "code": None, "password": "new_password"},
        {"email": "alice@gmail.com", "code": "", "password": "new_password"},
        {"email": "alice@gmail.com", "code": "123456"},
        {"code": "123456", "password": "new_password"},
    ])
    def test_missing_field_returns_400_without_touching_db(self, client, mocker, body):
        connect = mocker.patch("app.psycopg2.connect")

        resp = client.post("/api/change_password", json=body)

        assert resp.status_code == 400
        assert resp.get_json() == {"error": "Missing email, code, or password"}
        connect.assert_not_called()

    def test_non_json_body_returns_400_without_touching_db(self, client, mocker):
        connect = mocker.patch("app.psycopg2.connect")

        resp = client.post("/api/change_password", data="not json", content_type="text/plain")

        assert resp.status_code == 400
        connect.assert_not_called()

    def test_looks_up_only_the_named_accounts_live_code(self, client, db):
        _, cursor = db
        cursor.fetchone.return_value = None

        client.post("/api/change_password", json={**self.BODY, "email": " Alice@Gmail.com "})

        sql, params = cursor.execute.call_args_list[0].args
        assert params == ("alice@gmail.com",)
        assert "LOWER(u.email) = %s" in sql
        assert "used_at IS NULL" in sql
        assert "expires_at > NOW()" in sql

    def test_no_live_code_returns_400_and_changes_nothing(self, client, db):
        conn, cursor = db
        cursor.fetchone.return_value = None

        resp = client.post("/api/change_password", json=self.BODY)

        assert resp.status_code == 400
        assert resp.get_json() == {"error": "Invalid or expired code"}
        assert cursor.execute.call_count == 1
        conn.commit.assert_not_called()

    def test_wrong_code_counts_an_attempt(self, client, db):
        conn, cursor = db
        cursor.fetchone.return_value = (42, 7, sha256("999999"), 0)

        resp = client.post("/api/change_password", json=self.BODY)

        assert resp.status_code == 400
        cursor.execute.assert_called_with(
            "UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = %s", (42,))
        conn.commit.assert_called_once()

    def test_correct_code_is_refused_once_attempts_are_used_up(self, client, db):
        conn, cursor = db
        cursor.fetchone.return_value = (42, 7, sha256("123456"), MAX_RESET_ATTEMPTS)

        resp = client.post("/api/change_password", json=self.BODY)

        assert resp.status_code == 400
        assert cursor.execute.call_count == 1
        conn.commit.assert_not_called()

    def test_correct_code_resets_password_uses_code_and_ends_sessions(self, client, mocker, db):
        conn, cursor = db
        cursor.fetchone.return_value = (42, 7, sha256("123456"), 0)
        mocker.patch("app.hash_function", return_value="fixed")

        resp = client.post("/api/change_password", json=self.BODY)

        assert resp.status_code == 204
        cursor.execute.assert_any_call("UPDATE users SET password_hash = %s WHERE id = %s", ("fixed", 7))
        cursor.execute.assert_any_call("UPDATE password_reset_codes SET used_at = NOW() WHERE id = %s", (42,))
        cursor.execute.assert_any_call("DELETE FROM sessions WHERE user_id = %s", (7,))
        conn.commit.assert_called_once()

    def test_db_error_rolls_back_and_hides_the_message(self, client, db):
        conn, cursor = db
        cursor.execute.side_effect = Exception("db down")

        resp = client.post("/api/change_password", json=self.BODY)

        assert resp.status_code == 500
        assert resp.get_json() == {"error": "Could not reset password"}
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()
        conn.close.assert_called_once()

#Adding More Unit-Tests In the Future

class Test_send_keybinds:
    def test_send_keybinds_options_preflight(self, client):
        resp = client.options("/api/send_keybinds")
        assert resp.status_code == 200

    def test_send_keybinds_no_sid_returns_401(self, client, mocker):
        connect = mocker.patch("app.psycopg2.connect")

        resp = client.post("/api/send_keybinds", json={"name": "alice", "settings": {"KEEP_CARD": ["E"]}})

        assert resp.status_code == 401
        assert resp.get_json() == {"error": "Not authenticated"}
        connect.assert_not_called()

    def test_send_keybinds_invalid_session_returns_401(self, client, mocker):
        mocker.patch("app.get_session_account", return_value=None)
        client.set_cookie("sid", "stale-sid")

        resp = client.post("/api/send_keybinds", json={"name": "alice", "settings": {"KEEP_CARD": ["E"]}})

        assert resp.status_code == 401
        assert resp.get_json() == {"error": "Session expired or invalid"}

    def test_send_keybinds_session_lookup_error_returns_500(self, client, mocker):
        mocker.patch("app.get_session_account", side_effect=Exception("db down"))
        client.set_cookie("sid", "good-sid")

        resp = client.post("/api/send_keybinds", json={"settings": {"KEEP_CARD": ["E"]}})

        assert resp.status_code == 500
        assert resp.get_json() == {"error": "db down"}

    def test_send_keybinds_uses_session_username_not_body_name(self, client, mocker, db):
        _, cursor = db
        cursor.fetchone.return_value = None
        mocker.patch("app.get_session_account", return_value=SessionAccount(user_id=7, username="alice"))
        client.set_cookie("sid", "good-sid")

        resp = client.post("/api/send_keybinds", json={"name": "mallory", "settings": {"KEEP_CARD": ["E"]}})

        assert resp.status_code == 200
        cursor.execute.assert_any_call("SELECT username FROM keybinds WHERE username = %s", ("alice",))
        cursor.execute.assert_any_call("INSERT INTO keybinds (username, keep_card) VALUES (%s, %s)", ["alice", "E"])

class Test_signout:
    def test_signout_options_preflight(self, client):
        resp = client.open("/api/signout", method="OPTIONS")
        assert resp.status_code == 200

    def test_signout_deletes_this_sessions_row_and_clears_cookie(self, client, db):
        conn, cursor = db
        client.set_cookie("sid", "good-sid")

        resp = client.post("/api/signout")

        cursor.execute.assert_called_once_with("DELETE FROM sessions WHERE session_id = %s", ("good-sid",))
        conn.commit.assert_called_once()
        cursor.close.assert_called_once()
        conn.close.assert_called_once()
        assert resp.status_code == 200
        assert resp.get_json() == {"message": "Signed out"}
        set_cookie = resp.headers.get("Set-Cookie")
        assert set_cookie.startswith("sid=;")
        assert "Max-Age=0" in set_cookie
        assert "Path=/" in set_cookie
        assert "HttpOnly" in set_cookie
        assert client.get_cookie("sid") is None

    def test_signout_clears_cookie_with_signin_attributes_on_localhost(self, client, db):
        client.set_cookie("sid", "good-sid")

        resp = client.post("/api/signout")

        set_cookie = resp.headers.get("Set-Cookie")
        assert "SameSite=Lax" in set_cookie
        assert "Secure" not in set_cookie

    def test_signout_clears_cookie_with_signin_attributes_in_production(self, client, db):
        client.set_cookie("sid", "good-sid", domain="playbiblios.com")

        resp = client.post("/api/signout", base_url="https://playbiblios.com")

        set_cookie = resp.headers.get("Set-Cookie")
        assert "SameSite=None" in set_cookie
        assert "Secure" in set_cookie

    def test_signout_without_sid_succeeds_without_touching_db(self, client, mocker):
        connect = mocker.patch("app.psycopg2.connect")

        resp = client.post("/api/signout")

        connect.assert_not_called()
        assert resp.status_code == 200
        assert resp.get_json() == {"message": "Signed out"}
        assert resp.headers.get("Set-Cookie").startswith("sid=;")

    def test_signout_db_error_returns_500_and_keeps_cookie(self, client, db):
        conn, cursor = db
        cursor.execute.side_effect = Exception("db down")
        client.set_cookie("sid", "good-sid")

        resp = client.post("/api/signout")

        assert resp.status_code == 500
        assert resp.get_json() == {"error": "db down"}
        assert resp.headers.get("Set-Cookie") is None
        cursor.close.assert_called_once()
        conn.close.assert_called_once()




class Test_game_result:
    SECRET = "unit-test-secret"
    PLACINGS = [{"player_id": "user:7", "rank": 1}, {"player_id": "guest:x", "rank": 2}]

    @pytest.fixture(autouse=True)
    def secret(self, monkeypatch):
        monkeypatch.setenv("GAME_RESULT_SECRET", self.SECRET)

    def post(self, client, body, secret=SECRET):
        return client.post("/api/internal/game_result", json=body, headers={"X-Game-Result-Secret": secret})

    def test_wrong_secret_returns_401_without_touching_db(self, client, mocker):
        connect = mocker.patch("app.psycopg2.connect")

        resp = self.post(client, {"game_id": "g", "placings": self.PLACINGS}, secret="nope")

        connect.assert_not_called()
        assert resp.status_code == 401

    @pytest.mark.parametrize("body", [
        {"placings": [{"player_id": "user:7", "rank": 1}]},
        {"game_id": "", "placings": [{"player_id": "user:7", "rank": 1}]},
        {"game_id": "g"},
        {"game_id": "g", "placings": []},
        {"game_id": "g", "placings": [{"player_id": "user:7", "rank": 1}, {"player_id": "user:8", "rank": 1}]},
        {"game_id": "g", "placings": [{"player_id": "user:7", "rank": 2}]},
        {"game_id": "g", "placings": [{"player_id": "user:7", "rank": True}]},
        {"game_id": "g", "placings": ["user:7"]},
        {"game_id": "g", "placings": [{"player_id": "user:7", "rank": 1}, {"player_id": "user:7", "rank": 2}]},
        {"game_id": "g", "placings": [{"player_id": 7, "rank": 1}]},
        {"game_id": "g", "placings": [{"rank": 1}]},
    ])
    def test_malformed_report_returns_400_without_touching_db(self, client, mocker, body):
        connect = mocker.patch("app.psycopg2.connect")

        resp = self.post(client, body)

        connect.assert_not_called()
        assert resp.status_code == 400

    def test_db_error_returns_500_and_commits_nothing(self, client, db):
        conn, cursor = db
        cursor.execute.side_effect = Exception("db down")

        resp = self.post(client, {"game_id": "g", "placings": self.PLACINGS})

        assert resp.status_code == 500
        # The database's own message is logged, not sent back.
        assert resp.get_json() == {"error": "Could not record the Game result"}
        conn.commit.assert_not_called()
        conn.close.assert_called_once()
