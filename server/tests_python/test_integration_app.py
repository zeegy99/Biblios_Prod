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

    

def expire_session(sid):
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE session_id = %s", (sid,))
    conn.commit()
    cur.close()
    conn.close()

def elo_of(username):
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT elo_score FROM elo WHERE username = %s", (username,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0]

class Test_update_elo:
    def test_signed_in_request_is_refused_with_410_and_changes_no_elo(self, client, signin_user, existing_user):
        sign_in(client, signin_user)

        resp = client.post("/api/update_elo", json={"username": "test_1", "eloChange": 25})

        assert resp.status_code == 410
        assert elo_of("signin_user") == 1000
        assert elo_of("test_1") == 900

    def test_request_without_session_is_refused_with_410_and_changes_no_elo(self, client, signin_user):
        resp = client.post("/api/update_elo", json={"username": "signin_user", "eloChange": 25})

        assert resp.status_code == 410
        assert elo_of("signin_user") == 1000

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

class Test_send_keybinds:
    SETTINGS = {"DONATE_CARD": ["Z"], "KEEP_CARD": ["X"]}

    def _seed_other_user(self):
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (email, username, password_hash) VALUES (%s, %s, %s)",
            ("other@gmail.com", "other_user", "some_password")
        )
        conn.commit()
        cur.close()
        conn.close()

    def _saved_keybinds(self):
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute("SELECT username, donate_card, keep_card FROM keybinds ORDER BY username")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows

    def test_saves_under_session_username_when_body_names_another_account(self, client, signin_user):
        self._seed_other_user()
        sign_in(client, signin_user)

        resp = client.post("/api/send_keybinds", json={"name": "other_user", "settings": self.SETTINGS})

        assert resp.status_code == 200
        assert self._saved_keybinds() == [("signin_user", "Z", "X")]

    def test_updates_existing_keybinds_for_session_username(self, client, signin_user):
        sign_in(client, signin_user)
        client.post("/api/send_keybinds", json={"settings": self.SETTINGS})

        resp = client.post("/api/send_keybinds", json={"settings": {"DONATE_CARD": ["Y"]}})

        assert resp.status_code == 200
        assert self._saved_keybinds() == [("signin_user", "Y", "X")]

    def test_no_session_returns_401_and_saves_nothing(self, client, signin_user):
        resp = client.post("/api/send_keybinds", json={"name": "signin_user", "settings": self.SETTINGS})

        assert resp.status_code == 401
        assert self._saved_keybinds() == []

    def test_expired_session_returns_401_and_saves_nothing(self, client, signin_user):
        sid = sign_in(client, signin_user)
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute("UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE session_id = %s", (sid,))
        conn.commit()
        cur.close()
        conn.close()

        resp = client.post("/api/send_keybinds", json={"name": "signin_user", "settings": self.SETTINGS})

        assert resp.status_code == 401
        assert self._saved_keybinds() == []

    @pytest.mark.parametrize("bad_key", ["NOT_A_KEYBIND", "x = 'y', username"])
    def test_unknown_key_on_insert_returns_400_and_saves_nothing(self, client, signin_user, bad_key):
        sign_in(client, signin_user)

        resp = client.post("/api/send_keybinds", json={"settings": {"KEEP_CARD": ["X"], bad_key: ["Q"]}})

        assert resp.status_code == 400
        assert self._saved_keybinds() == []

    @pytest.mark.parametrize("bad_key", ["NOT_A_KEYBIND", "x = 'y', username"])
    def test_unknown_key_on_update_returns_400_and_changes_nothing(self, client, signin_user, bad_key):
        sign_in(client, signin_user)
        client.post("/api/send_keybinds", json={"settings": self.SETTINGS})

        resp = client.post("/api/send_keybinds", json={"settings": {"DONATE_CARD": ["Y"], bad_key: ["Q"]}})

        assert resp.status_code == 400
        assert self._saved_keybinds() == [("signin_user", "Z", "X")]

def session_ids_of(user_id):
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT session_id FROM sessions WHERE user_id = %s", (user_id,))
    rows = {row[0] for row in cur.fetchall()}
    cur.close()
    conn.close()
    return rows

class Test_signout:
    def test_ends_this_session_and_leaves_the_accounts_other_session(self, client, signin_user):
        other_sid = sign_in(client, signin_user)
        sid = sign_in(client, signin_user)

        resp = client.post("/api/signout")

        assert resp.status_code == 200
        assert client.get_cookie("sid") is None
        assert session_ids_of(signin_user["user_id"]) == {other_sid}

        client.set_cookie("sid", sid)
        assert client.get("/api/current-user").status_code == 401

        client.set_cookie("sid", other_sid)
        resp = client.get("/api/current-user")
        assert resp.status_code == 200
        assert resp.get_json()["username"] == "signin_user"

    def test_without_session_succeeds(self, client, signin_user):
        other_sid = sign_in(client, signin_user)
        client.delete_cookie("sid")

        resp = client.post("/api/signout")

        assert resp.status_code == 200
        assert session_ids_of(signin_user["user_id"]) == {other_sid}

    def test_with_unknown_sid_succeeds_and_clears_cookie(self, client, signin_user):
        other_sid = sign_in(client, signin_user)
        client.set_cookie("sid", "not-a-real-session")

        resp = client.post("/api/signout")

        assert resp.status_code == 200
        assert client.get_cookie("sid") is None
        assert session_ids_of(signin_user["user_id"]) == {other_sid}

    def test_with_expired_session_succeeds_and_deletes_its_row(self, client, signin_user):
        sid = sign_in(client, signin_user)
        expire_session(sid)

        resp = client.post("/api/signout")

        assert resp.status_code == 200
        assert client.get_cookie("sid") is None
        assert session_ids_of(signin_user["user_id"]) == set()

class Test_public_reads_without_session:
    def test_get_elo_works_without_session(self, client, existing_user):
        assert client.get_cookie("sid") is None

        resp = client.post("/api/get_elo", json={"username": "test_1"})

        assert resp.status_code == 200
        assert resp.get_json() == {"elo": 900}

    def test_get_leaderboard_works_without_session(self, client, existing_user, signin_user):
        assert client.get_cookie("sid") is None

        resp = client.get("/api/get_leaderboard")

        assert resp.status_code == 200
        assert resp.get_json() == [
            {"username": "signin_user", "elo": 1000},
            {"username": "test_1", "elo": 900},
        ]


RESULT_SECRET = "test-game-result-secret"

@pytest.fixture
def players(client, monkeypatch):
    """Three Signed-in Players at 1000 Elo, and the shared secret Node and
    Flask agree on for Game results. Yields their Player Identities by name."""
    monkeypatch.setenv("GAME_RESULT_SECRET", RESULT_SECRET)
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    ids = {}
    for name in ("ann", "bob", "cid"):
        cur.execute(
            "INSERT INTO users (email, username, password_hash) VALUES (%s, %s, %s) RETURNING id",
            (f"{name}@gmail.com", name, "some_password")
        )
        ids[name] = f"user:{cur.fetchone()[0]}"
        cur.execute("INSERT INTO elo (username, elo_score) VALUES (%s, %s)", (name, 1000))
    conn.commit()
    cur.close()
    conn.close()
    yield ids
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE game_results")
    conn.commit()
    cur.close()
    conn.close()

def report_result(client, game_id, placings, secret=RESULT_SECRET):
    headers = {"X-Game-Result-Secret": secret} if secret is not None else {}
    return client.post("/api/internal/game_result", json={"game_id": game_id, "placings": placings}, headers=headers)

def ranked(*player_ids):
    return [{"player_id": p, "rank": i + 1} for i, p in enumerate(player_ids)]

class Test_game_result:
    def test_without_the_shared_secret_is_refused_and_changes_nothing(self, client, players):
        resp = report_result(client, "game-1", ranked(players["ann"], players["bob"]), secret=None)

        assert resp.status_code == 401
        assert elo_of("ann") == 1000 and elo_of("bob") == 1000

    def test_with_a_wrong_secret_is_refused_and_changes_nothing(self, client, players):
        resp = report_result(client, "game-1", ranked(players["ann"], players["bob"]), secret="guessed")

        assert resp.status_code == 401
        assert elo_of("ann") == 1000 and elo_of("bob") == 1000

    def test_is_refused_when_flask_has_no_secret_configured(self, client, players, monkeypatch):
        monkeypatch.delenv("GAME_RESULT_SECRET")

        resp = report_result(client, "game-1", ranked(players["ann"], players["bob"]), secret="")

        assert resp.status_code == 503
        assert elo_of("ann") == 1000 and elo_of("bob") == 1000

    def test_applies_the_elo_formula_with_guests_taking_placings(self, client, players):
        # Four places: +20, +10, -10, -20. The Guest has no Elo but still takes second place.
        resp = report_result(client, "game-1", ranked(players["bob"], "guest:abc", players["ann"], players["cid"]))

        assert resp.status_code == 200
        assert (elo_of("bob"), elo_of("ann"), elo_of("cid")) == (1020, 990, 980)

    def test_with_an_odd_number_of_seats_the_median_place_gets_nothing(self, client, players):
        resp = report_result(client, "game-1", ranked(players["cid"], players["ann"], players["bob"]))

        assert resp.status_code == 200
        assert (elo_of("cid"), elo_of("ann"), elo_of("bob")) == (1010, 1000, 990)

    def test_a_repeat_report_for_the_same_game_changes_nothing(self, client, players):
        placings = ranked(players["ann"], players["bob"])
        assert report_result(client, "game-1", placings).status_code == 200

        resp = report_result(client, "game-1", placings)

        assert resp.status_code == 200
        assert resp.get_json() == {"recorded": False}
        assert (elo_of("ann"), elo_of("bob")) == (1010, 990)

        # Another Game between the same players counts.
        assert report_result(client, "game-2", placings).get_json() == {"recorded": True}
        assert (elo_of("ann"), elo_of("bob")) == (1020, 980)
