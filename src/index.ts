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

app.use(cors());
app.use(express.json());

//? creating routes
// creating a route for authentication
app.use("/app/api/auth", auth);
app.use("/app/api/server", serverRout);

app.use(
  session({
    secret: "1234frwcgmjfuwjfejkwbg3r5523732576325",
    resave: false,
    saveUninitialized: true,
  })
);
app.use("/app/api/googleAuth", LogInWithGoogle);

//

//

// Passport.js initialization to use Google authentication
app.use(passport.initialize());
app.use(passport.session());

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
  if (socket.handshake.auth.token != undefined) {
    Handel_User_Online_Status(
      socket.handshake.auth.token as string,
      true as boolean
    );
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
    }
    // console.log("user disconnected");
  });
});
