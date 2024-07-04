import { configDotenv } from "dotenv";
configDotenv();
import express from "express";
import cors from "cors";
import auth from "./routes/auth";
import serverRout from "./routes/serverRout";
const app = express();
const Port = process.env.PORT || 500;
import passport from "passport";
import io from "socket.io";

app.use(passport.initialize());
app.use(cors());
app.use(express.json());

//? creating routes
// creating a route for authentication
app.use("/app/api/auth", auth);
app.use("/app/api/server", serverRout);

const server = app.listen(Port, () => {
  console.log(`Server running on localhost:${Port}`);
});
const socketIo = new io.Server(server, {
  cors: {
    origin: true,
  },
  pingTimeout: 60000,
});

socketIo.on("connection", (socket) => {
  // console.log("user connected");

  // socket.on("newServerCreationOccurred", () => {
  //   socketIo.emit("EmitNewServerCreated");
  // });
  socket.on("disconnect", () => {
    // console.log("user disconnected");
  });
});
