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

      return res.status(200).json({
        success: true,
        message: "Follow request sent successfully",
        request_sender_info: {
          id: request_sender.id,
          name: request_sender.FullName,
          UserName: request_sender.UserName,
          Profile_Picture: request_sender.Profile_Picture,
        },
        request_receiver_info: {
          id: request_receiver.id,
          name: request_receiver.FullName,
          UserName: request_receiver.UserName,
          Profile_Picture: request_receiver.Profile_Picture,
        },
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
          message: " he,lllllll find all the sent requests in cache",
          sent_requests: JSON.parse(sentRequestsInCache as string),
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
routes.put(
  "/AcceptTheFollowRequestOfTheUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { receiverId } = req.body;
      const sender_key_sent_req = `requestsSendStoredInCache_${req.user_id}`;
      const sender_key_received_req = `requestsReceivedStoredInCache_${req.user_id}`;
      const receiver_key_sent_req = `requestsSendStoredInCache_${receiverId}`;
      const receiver_key_received_req = `requestsReceivedStoredInCache_${receiverId}`;
      //   for sender
      await DeleteSpecificDataInRedis(sender_key_sent_req);
      await DeleteSpecificDataInRedis(sender_key_received_req);
      // for receiver
      await DeleteSpecificDataInRedis(receiver_key_sent_req);
      await DeleteSpecificDataInRedis(receiver_key_received_req);
      if (!receiverId) {
        return res.status(400).json({
          success: false,
          message: "receiverId is required",
        });
      }
      const request_accepter = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          requestReceived: {
            disconnect: [
              {
                id: receiverId,
              },
            ],
          },
          followers: {
            connect: [
              {
                id: receiverId,
              },
            ],
          },
        },
      });
      const request_sender = await database.user.update({
        where: {
          id: receiverId,
        },
        data: {
          requestsSend: {
            disconnect: [
              {
                id: req.user_id,
              },
            ],
          },
          following: {
            connect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: "Follow request accepted successfully",
        request_accepter_info: {
          id: request_accepter.id,
          name: request_accepter.FullName,
          UserName: request_accepter.UserName,
          Profile_Picture: request_accepter.Profile_Picture,
        },
        request_sender_info: {
          id: request_sender.id,
          name: request_sender.FullName,
          UserName: request_sender.UserName,
          Profile_Picture: request_sender.Profile_Picture,
        },
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while accepting the follow request",
      });
    }
  }
);
routes.put(
  "/WithdrawTheFollowRequest",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { receiverId } = req.body;

      if (!receiverId)
        return res.status(400).json({
          success: false,
          message: "receiverId is required",
        });

      //
      // ? Now We will check that the user have any data in the cache or not and if have then we will delete that data from the cache
      //
      const sender_key_sent_req = `requestsSendStoredInCache_${req.user_id}`;
      const sender_key_received_req = `requestsReceivedStoredInCache_${req.user_id}`;
      const receiver_key_sent_req = `requestsSendStoredInCache_${receiverId}`;
      const receiver_key_received_req = `requestsReceivedStoredInCache_${receiverId}`;
      //   for sender
      await DeleteSpecificDataInRedis(sender_key_sent_req);
      await DeleteSpecificDataInRedis(sender_key_received_req);
      // for receiver
      await DeleteSpecificDataInRedis(receiver_key_sent_req);
      await DeleteSpecificDataInRedis(receiver_key_received_req);
      //
      // ? Now The Main Logic code of this API
      //
      const request_sender = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          requestsSend: {
            disconnect: [
              {
                id: receiverId,
              },
            ],
          },
        },
      });

      const request_receiver = await database.user.update({
        where: {
          id: receiverId,
        },
        data: {
          requestReceived: {
            disconnect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: "Request withdrawn successfully",
        request_sender_info: {
          id: request_sender.id,
          name: request_sender.FullName,
          UserName: request_sender.UserName,
          Profile_Picture: request_sender.Profile_Picture,
        },
        request_receiver_info: {
          id: request_receiver.id,
          name: request_receiver.FullName,
          UserName: request_receiver.UserName,
          Profile_Picture: request_receiver.Profile_Picture,
        },
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while withdrawing the follow request",
      });
    }
  }
);
routes.put(
  "/IgnoreTheFollowRequestFromTheUser",
  CheckAuthToken,
  multer().none(),
  async (req: any, res: any) => {
    try {
      const { senderId } = req.body;

      if (!senderId || senderId === "undefined")
        return res.status(400).json({
          success: false,
          message: "receiverId is required",
        });
      const sender_key_sent_req = `requestsSendStoredInCache_${senderId}`;
      const sender_key_received_req = `requestsReceivedStoredInCache_${senderId}`;
      const receiver_key_sent_req = `requestsSendStoredInCache_${req.user_id}`;
      const receiver_key_received_req = `requestsReceivedStoredInCache_${req.user_id}`;
      //   for sender
      await DeleteSpecificDataInRedis(sender_key_sent_req);
      await DeleteSpecificDataInRedis(sender_key_received_req);
      // for receiver
      await DeleteSpecificDataInRedis(receiver_key_sent_req);
      await DeleteSpecificDataInRedis(receiver_key_received_req);
      const request_sender = await database.user.update({
        where: {
          id: senderId,
        },
        data: {
          requestsSend: {
            disconnect: [
              {
                id: req.user_id,
              },
            ],
          },
        },
      });
      const request_receiver = await database.user.update({
        where: {
          id: req.user_id,
        },
        data: {
          requestReceived: {
            disconnect: [
              {
                id: senderId,
              },
            ],
          },
        },
      });
      return res.status(200).json({
        success: true,
        message: "Request ignored successfully",
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        success: false,
        message: "Internal server error while ignoring the follow request",
      });
    }
  }
);
export default routes;
