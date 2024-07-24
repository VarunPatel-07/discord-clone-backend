import { configDotenv } from "dotenv";
configDotenv();
import express from "express";
import cors from "cors";
import auth from "./routes/auth";
import serverRout from "./routes/serverRout";
import LogInWithGoogle from "./routes/LogInWithGoogle";
const app = express();
const Port = process.env.PORT as string;
import passport from "passport";
import io from "socket.io";
import Handel_User_Online_Status from "./Helper/HandelUserOnlineStatus";
import session from "express-session";
import redis from "./Redis";
import cookieParser = require("cookie-parser");

app.use(
  cors({
    origin: true, // Update with your frontend URL
    credentials: true, // Allow cookies to be sent
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ? using the redis to store information in cache

redis.on("connect", () => {
  console.log("connected to redis 📶 🥳");
});
redis.on("error", (err) => {
  console.log(err);
})

// ? using express-session to Create a session For the User Login/Signup With Google Or Other Providers
app.use(
  session({
    secret: process.env.EXPRESS_SESSION_SECRET as string,
    resave: false,
    saveUninitialized: true,
  })
);

//? creating routes
// creating a route for authentication
app.use("/app/api/auth", auth);
app.use("/app/api/server", serverRout);
// Passport.js initialization to use Google authentication
app.use(passport.initialize());
app.use(passport.session());
app.use("/app/api/googleAuth", LogInWithGoogle);

//

//

const server = app.listen(Port, () => {
  console.log(`Server running on localhost:${Port} 🥳`);
});
const socketIo = new io.Server(server, {
  cors: {
    origin: true,
  },
  pingTimeout: 60000,
});

socketIo.on("connection", (socket) => {
  if (socket.handshake.auth.token != undefined) {
    Handel_User_Online_Status(
      socket.handshake.auth.token as string,
      true as boolean
    );
    socket.broadcast.emit("EmitUserStatusChanged");
  }

  socket.on("newServerCreationOccurred", () => {
    socket.broadcast.emit("EmitNewServerCreated");
  });
  socket.on("NewMemberJoined", () => {
    socket.broadcast.emit("New_Member_Joined");
  });
  socket.on("ServerInfoUpdated", () => {
    socket.broadcast.emit("EmitServerInfoUpdated");
  });
  socket.on("MemberRemovedByAdmin", ({ ...data }) => {
    socket.broadcast.emit("EmitMemberRemovedByAdmin", data);
  });
  socket.on("ServerHasBeenDeleted", ({ ...data }) => {
    socket.broadcast.emit("EmitServerHasBeenDeleted", data);
  });
  socket.on("NewChannelHasBeenCreated", () => {
    socket.broadcast.emit("EmitNewChannelHasBeenCreated");
  });

  socket.on("disconnect", () => {
    if (socket.handshake.auth.token != undefined) {
      Handel_User_Online_Status(
        socket.handshake.auth.token as string,
        false as boolean
      );
      socket.broadcast.emit("EmitUserStatusChanged");
    }
    // console.log("user disconnected");
  });
  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err);
  });
});
