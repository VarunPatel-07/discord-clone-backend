import { configDotenv } from "dotenv";
configDotenv();
import express from "express";
import cors from "cors";
import auth from "./routes/auth";
const app = express();
const Port = process.env.PORT || 500;
app.use(cors());
app.use(express.json());

//? creating routes
// creating a route for authentication
app.use("/app/api/auth", auth);

app.listen(Port, () => {
  console.log(`Server running on localhost:${Port}`);
});    
