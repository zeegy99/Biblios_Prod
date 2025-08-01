const sql = require("mssql/msnodesqlv8");

const config = {
  server: "MSI", 
  database: "biblios_database",      
  driver: "msnodesqlv8",
  options: {
    trustedConnection: true,     
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log("✅ Connected to MSSQL with Windows Authentication");
    return pool;
  })
  .catch(err => {
     console.error("❌ Database connection failed:");
  console.error(JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  });

module.exports = {
  sql,
  poolPromise
};
