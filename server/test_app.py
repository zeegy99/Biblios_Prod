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

def test_signin_options_preflight(client):
    resp = client.open("/api/signin", method="OPTIONS")
    assert resp.status_code == 200

def test_signin_wrong_username(client, mocker):
    mock_cursor = mocker.MagicMock()
    mock_cursor.fetchone.return_value = None
    mock_conn = mocker.MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mocker.patch("app.psycopg2.connect", return_value=mock_conn)

    resp = client.post("/api/signin", json={"username": "abc", "password": "ghi"})

    assert resp.status_code == 401
    assert resp.get_json()["error"] == "Invalid username or password"

