import pytest
import psycopg2
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app import app  

os.environ["DATABASE_URL"] = "postgresql://postgres:test@localhost:5432/biblios_database_dev"
os.environ["SECRET_KEY"] = "test-secret-key-doesnt-matter-for-this-test"

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

    

    