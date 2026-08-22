# test_app.py
from app import app
import pytest

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c

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

class Test_current_user:
    pass
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

# class Test_get_leaderboard:
#     def test_

