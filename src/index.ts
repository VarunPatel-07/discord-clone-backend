import { configDotenv } from "dotenv";
configDotenv();
import express from "express";

import cors from "cors";
import auth from "./routes/auth";
import serverRout from "./routes/serverRout";
import LogInWithGoogle from "./routes/LogInWithGoogle";
const app = express();
const Port = (process.env.PORT as string) || 500;
import passport from "passport";
import { Server as SocketIOServer } from "socket.io";
import Handel_User_Online_Status from "./Helper/HandelUserOnlineStatus";
import Follow from "./routes/Follow";
import session from "express-session";
import redis from "./Redis";
import cookieParser from "cookie-parser";
import Message from "./routes/Messages";
import VideoCall from "./routes/VideoCall";
import Notification from "./routes/Notification";
import OneToOneMessage from "./routes/OneToOneMessage";

app.use(
  cors({
    origin: "*", // Update with your frontend URL
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
});

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
app.use("/app/api/follow", Follow);
app.use("/app/api/Messages", Message);
app.use("/app/api/OneToOneMessage", OneToOneMessage);
app.use("/app/api/VideoCall", VideoCall);
app.use("/app/api/Notification", Notification);

// Passport.js initialization to use Google authentication
app.use(passport.initialize());
app.use(passport.session());
app.use("/app/api/googleAuth", LogInWithGoogle);

// Now We Are Creating API For The One O  One Message Or Group Message

//

//

const server = app.listen(Port, () => {
  console.log(`Server running on localhost:${Port} 🥳`);
});
const io = new SocketIOServer(server, {
  pingTimeout: 60000,
  cors: {
    origin: true,
  },
});

io.on("connection", (socket) => {
  const token = socket.handshake.auth.token;
  if (token) {
    Handel_User_Online_Status(token as string, true);
    socket.broadcast.emit("EmitUserStatusChanged");
  }

  socket.on("newServerCreationOccurred", (data) => {
    socket.broadcast.emit("EmitNewServerCreated", data);
  });

  socket.on("New_UserJoined_The_Server", (data) => {
    socket.broadcast.emit("EmitNew_UserJoined_The_Server");
  });

  socket.on("ServerInfoUpdated", () => {
    socket.broadcast.emit("EmitServerInfoUpdated");
  });

  socket.on("MemberRemovedByAdmin", (data) => {
    socket.broadcast.emit("EmitThatMemberRemovedByAdmin", data);
  });

  socket.on("ServerHasBeenDeleted", (data) => {
    socket.broadcast.emit("EmitServerHasBeenDeleted", data);
  });

  socket.on("NewChannelHasBeenCreated", (data) => {
    socket.broadcast.emit("EmitNewChannelHasBeenCreated");
  });
  socket.on("NewFollowRequestHasBeenSent", (data) => {
    // console.log("NewFollowRequestHasBeenSent", data);
    socket.broadcast.emit("EmitNewFollowRequestHasBeenSent", data);
  });
  socket.on("A_FollowRequestHasBeenWithdrawn", () => {
    socket.broadcast.emit("EmitA_FollowRequestHasBeenWithdrawn");
  });
  socket.on("A_FollowRequestHasBeenIgnored", () => {
    socket.broadcast.emit("EmitA_FollowRequestHasBeenIgnored");
  });
  socket.on("YourFollowRequestHasBeenAccepted", (data) => {
    socket.broadcast.emit("EmitYourFollowRequestHasBeenAccepted", data);
  });
  socket.on("UserUnFollowedAnFollower", (data) => {
    socket.broadcast.emit("EmitUserUnFollowedAnFollower", data);
  });
  socket.on("AnFollowerHasBeenRemoved", () => {
    socket.broadcast.emit("EmitAnFollowerHasBeenRemoved");
  });

  socket.on("StartTyping", (data) => {
    socket.broadcast.emit("EmitStartTyping", data);
  });
  socket.on("StopTyping", (data) => {
    socket.broadcast.emit("EmitStopTyping");
  });

  socket.on("NewMessageHasBeenSent", (data) => {
    socket.broadcast.emit("EmitNewMessageHasBeenSent", data);
  });

  socket.on("AnUserBlockedSuccessfully", () => {
    socket.broadcast.emit("EmitAnUserBlockedSuccessfully");
  });
  socket.on("AnUser_UnBlocked_Successfully", () => {
    socket.broadcast.emit("EmitAnUser_UnBlocked_Successfully");
  });
  socket.on("MessageHasBeenEditedSuccessfully", (data) => {
    socket.broadcast.emit("EmitMessageHasBeenEditedSuccessfully", data);
  });
  socket.on("UserProfileUpdatedSuccessfully", () => {
    socket.broadcast.emit("EmitUserProfileUpdatedSuccessfully");
  });

  socket.on("SendMeetingIdToTheMemberOfTheServer", (data) => {
    socket.broadcast.emit("EmitSendMeetingIdToTheMemberOfTheServer", data);
  });

  //
  // ? write code here for the video call and the voice call
  //

  socket.on("disconnect", () => {
    if (token) {
      Handel_User_Online_Status(token as string, false);
      socket.broadcast.emit("EmitUserStatusChanged");
    }
  });
});
