// Import & enable dotenv in the file:
require("dotenv").config();

// Express app:
const express = require("express");
const app = express();

// Import Mongoose:
const mongoose = require("mongoose");

// Import & apply cors package:
const cors = require("cors");
app.use(cors()); // more on .use() method below...

/* Assign routes (which we will later define in respective files), 
  to variables (in my app so far, : */
const userRoutes = require("./routes/users.cjs");
const eventRoutes = require("./routes/events.cjs");

// MIDDLEWARE

/* .use() is a method on an Express app. It mounts the specified 
middleware function(s) at the specified path: the middleware 
function is executed when the base of the requested path matches path */

/* If any request has data that it sends to the server, 
   the code on the next line attaches it to request object, 
   so we can access it in request handler */
app.use(express.json());

/* Whenever an HTTP request is made to a certain endpoint/path,
   log the path & type of request to console (seen in terminal) */
app.use((req, res, next) => {
  console.log(req.path, req.method);
  next();
});

// ROUTES
// Attach defined routes to their corresponding endpoints:
app.use("/palz/users", userRoutes);
// app.use("/palz/events", eventRoutes);
// app.use("/palz/messages", messageRoutes);

// Connect to Mongoose:
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    // Listen for requests only after connecting to DB:
    app.listen(process.env.PORT, () => {
      console.log(`Connected to DB & listening on port ${process.env.PORT}!`);
    });
  })
  // If there's an error connecting, we will see that in the terminal:
  .catch((error) => console.log(error));