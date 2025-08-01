const { sql, poolPromise } = require("./db");

async function testConnection() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT GETDATE() AS CurrentTime");
    console.log("✅ Connection successful. SQL Server time is:", result.recordset[0].CurrentTime);
  } catch (err) {
    console.error("❌ Connection failed:", err);
  }
}

testConnection();
