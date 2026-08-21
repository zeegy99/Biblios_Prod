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
        
# class Test_update_elo



