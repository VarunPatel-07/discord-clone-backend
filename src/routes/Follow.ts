import express from "express";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import multer from "multer";
import { database } from "../database";
import redis from "../Redis";
import {
  DeleteSpecificDataInRedis,
  StoreDataInRedis,
} from "../Helper/StorDataInRedis";

const routes = express.Router();

routes.post(
  "/SendFollowRequest",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    console.log(req.body);
    try {
      const { UserIdYouWantToFollow } = req.body;
      if (!UserIdYouWantToFollow)
        return res.status(400).json({
          success: false,
          message: "UserIdYouWantToFollow is required",
        });
      const request_sender_key_string = `requestsSendStoredInCache_${req.user_id}`;
      const request_receiver_key_string = `requestsReceivedStoredInCache_${UserIdYouWantToFollow}`;
      await DeleteSpecificDataInRedis(request_sender_key_string);
      await DeleteSpecificDataInRedis(request_receiver_key_string);
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          followers: true,
          following: true,
          requestReceived: true,
          requestsSend: true,
        },
      });

      if (!user) return;

      if (user.following.some((user) => user.id === UserIdYouWantToFollow)) {
        return res.status(400).json({
          success: false,
          message: " You Already following this user",
        });
      }
      if (user.requestsSend.some((user) => user.id === UserIdYouWantToFollow)) {
        return res.status(400).json({
          success: false,
          message: " You Already sent follow request to this user",
        });
      }
      const request_sender = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          requestsSend: {
            connect: [
              {
                id: UserIdYouWantToFollow,
              },
            ],
          },
        },
        include: {
          followers: true,
          following: true,
          requestReceived: true,
          requestsSend: true,
        },
      });
      const request_receiver = await database.user.update({
        where: {
          id: UserIdYouWantToFollow,
        },
        data: {
          requestReceived: {
            connect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
        include: {
          followers: true,
          following: true,
          requestReceived: true,
          requestsSend: true,
        },
      });

      await StoreDataInRedis(
        request_sender_key_string,
        JSON.stringify(request_sender)
      );
      await StoreDataInRedis(
        request_receiver_key_string,
        JSON.stringify(request_receiver)
      );
      return res.status(200).json({
        success: true,
        message: "Follow request sent successfully",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while sending follow request",
      });
    }
  }
);
routes.get(
  "/FetchAllTheTypeOfUserFollowers/:userType",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { userType } = req.params;

      if (!userType)
        return res.status(400).json({
          success: false,
          message: "userType is required",
        });
      if (userType === "online") {
        const user = await database.user.findMany({
          where: {
            Is_Online: true,
            NOT: {
              id: req.user_id,
            },
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
          user,
        });
      }
      if (userType === "all") {
        const user = await database.user.findMany({
          where: {
            NOT: {
              id: req.user_id,
            },
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
          user,
        });
      }
      if (userType === "blocked") {
        const user = await database.user.findUnique({
          where: {
            id: req.user_id,
          },
          include: {
            followers: true,
            following: true,
            requestReceived: true,
            requestsSend: true,
            blockedUsers: true,
          },
        });
        if (!user)
          return res
            .status(400)
            .json({ success: false, message: "User not found" });
        return res.status(200).json({
          success: true,
          user: user?.blockedUsers,
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message:
          "Internal server error while fetching the type of user followers",
      });
    }
  }
);
routes.get(
  "/FetchAllTheSentRequestsOfUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const key_string = `requestsSendStoredInCache_${req.user_id}`;
      const sentRequestsInCache = await redis.get(key_string);
      if (sentRequestsInCache) {
        return res.status(200).json({
          success: true,
          message: "find all the sent requests in cache",
          sent_requests: JSON.parse(sentRequestsInCache),
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          requestsSend: true,
        },
      });
      console.log(user);

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      await StoreDataInRedis(key_string, user.requestsSend);
      return res.status(200).json({
        success: true,
        message: "find all the sent requests",
        sent_requests: user?.requestsSend,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching sent requests",
      });
    }
  }
);
routes.get(
  "/FetchAllTheReceivedRequestsOfUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const key_string = `requestsReceivedStoredInCache_${req.user_id}`;
      const receivedRequestsInCache = await redis.get(key_string);
      if (receivedRequestsInCache) {
        return res.status(200).json({
          success: true,
          message: "find all the received requests in cache",
          received_requests: JSON.parse(receivedRequestsInCache),
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          requestReceived: true,
        },
      });
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }
      await StoreDataInRedis(key_string, user.requestReceived);
      return res.status(200).json({
        success: true,
        message: "find all the received requests",
        received_requests: user?.requestReceived,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching received requests",
      });
    }
  }
);
routes.get(
  "/FetchAllTheFollowersOfUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const key_string = `followersStoredInCache_${req.user_id}`;
      const followersInCache = await redis.get(key_string);
      if (followersInCache) {
        return res.status(200).json({
          success: true,
          message: "find all the followers in cache",
          followers: JSON.parse(followersInCache),
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          followers: true,
        },
      });
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      await StoreDataInRedis(key_string, user.followers);
      return res.status(200).json({
        success: true,
        message: "find all the followers",
        followers: user?.followers,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching followers",
      });
    }
  }
);
routes.get(
  "/FetchAllTheFollowingOfUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const key_string = `followingStoredInCache_${req.user_id}`;
      const followingInCache = await redis.get(key_string);
      if (followingInCache) {
        return res.status(200).json({
          success: true,
          message: "find all the following in cache",
          following: JSON.parse(followingInCache),
        });
      }
      const user = await database.user.findUnique({
        where: {
          id: req.user_id,
        },
        include: {
          following: true,
        },
      });
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      await StoreDataInRedis(key_string, user.following);
      return res.status(200).json({
        success: true,
        message: "find all the following",
        following: user?.following,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching following",
      });
    }
  }
);
export default routes;
