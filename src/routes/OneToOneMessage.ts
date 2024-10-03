import express from "express";
import { database } from "../database";
import CheckAuthToken from "../../middleware/CheckAuthToken";
import multer from "multer";
import redis from "../Redis";
import { StoreDataInRedis } from "../Helper/StorDataInRedis";
import { body, query, validationResult } from "express-validator";
const routes = express.Router();

// * (1) creating a route for creating one to one chat

routes.post("/CreateOneToOneChat", CheckAuthToken, multer().none(), async (req: any, res: any) => {
  try {
    const { receiver_id } = req.body;
    if (receiver_id === req.user_id) return;
    const sender_id = req.user_id;

    const FindChat = await database.oneToOneConversation.findFirst({
      where: {
        AND: [{ SenderId: sender_id }, { ReceiverId: receiver_id }],
      },
      include: {
        DirectMessages: true,
        Recever: true,
        Sender: true,
      },
    });

    if (FindChat) {
      return res.status(200).json({
        success: true,
        message: "Chat exists",
        data: FindChat,
      });
    }

    const CreateChat = await database.oneToOneConversation.create({
      data: {
        SenderId: sender_id,
        ReceiverId: receiver_id,
      },
      include: {
        DirectMessages: true,
        Recever: true,
        Sender: true,
      },
    });
    console.log(CreateChat);

    return res.status(200).json({
      success: true,
      message: "Chat created successfully",
      data: CreateChat,
    });
  } catch (error) {
    // // console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating one to one chat",
    });
  }
});

// * (2) creating a route for fetching all the conversation

routes.get("/FetchAllTheConversation", CheckAuthToken, async (req: any, res: any) => {
  try {
    const Cache_Key = `OneToOneConversation_${req.user_id}`;
    const Cache_Data = await redis.get(Cache_Key);
    if (Cache_Data) {
      return res.status(200).json({
        success: true,
        message: "Conversation fetched successfully from cache",
        data: JSON.parse(Cache_Data),
      });
    }

    const Fetch_All_Conversation = await database.oneToOneConversation.findMany({
      where: {
        OR: [{ SenderId: req.user_id }, { ReceiverId: req.user_id }],
      },
      include: {
        Sender: true,
        Recever: true,
      },
    });
    if (!Fetch_All_Conversation) {
      return res.status(200).json({
        success: true,
        message: "No conversation found",
        data: [],
      });
    }

    StoreDataInRedis(Cache_Key, Fetch_All_Conversation);
    return res.status(200).json({
      success: true,
      message: "Conversation fetched successfully",
      data: Fetch_All_Conversation,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching all the conversation",
    });
  }
});

// * (3) creating a route for fetching All the messages Of a conversation

routes.get("/FetchConversationMessages/:conversation_id", CheckAuthToken, async (req: any, res: any) => {
  try {
    const conversation_id = req.params.conversation_id.trim();
    const Page = parseInt(req.query.page as string) || 1;
    const Limit = parseInt(req.query.limit as string) || 10;

    const Cache_Key = `ConversationMessages:${conversation_id}:Page-${Page}`;
    const Cache_Data = await redis.get(Cache_Key);
    if (Cache_Data) {
      return res.status(200).json({
        success: true,
        message: "Conversation messages fetched successfully from cache",
        data: JSON.parse(Cache_Data),
      });
    }

    if (!conversation_id)
      return res.status(400).json({
        success: false,
        message: "conversation_id is required",
      });

    const FindConversation = await database.oneToOneConversation.findUnique({
      where: {
        id: conversation_id,
      },
    });
    if (!FindConversation)
      return res.status(400).json({
        success: false,
        message: "Conversation not found",
      });

    const Message = await database.directMessages.findMany({
      where: {
        ConversationId: conversation_id,
      },
      include: {
        Sender: true,
        Receiver: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      skip: (Page - 1) * Limit,
      take: Limit,
    });

    const TotalMessages = await database.directMessages.count({
      where: {
        ConversationId: conversation_id,
      },
    });
    const Data = {
      Message,
      TotalMessages,
    };

    StoreDataInRedis(Cache_Key, Data);

    return res.status(200).json({
      success: true,
      message: "Conversation messages fetched successfully",
      data: Data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching all the conversation messages",
    });
  }
});

// * (4) creating a route for sending message in conversation

routes.post(
  "/SendMessageInConversation/:conversation_id",
  CheckAuthToken,
  multer().none(),
  [body("message").exists().withMessage("message is required")],
  async (req: any, res: any) => {
    try {
      const { conversation_id } = req.params;
      if (!conversation_id) return res.status(400).json({ success: false, message: "conversation_id is required" });
      const { message } = req.body;
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ success: false, errors: result });
      }
      const FindConversation = await database.oneToOneConversation.findUnique({
        where: {
          id: conversation_id,
        },
      });
      if (!FindConversation) {
        return res.status(400).json({
          success: false,
          message: "Conversation not found",
        });
      }
      const receiver_id =
        FindConversation.SenderId === req.user_id ? FindConversation.ReceiverId : FindConversation.SenderId;
      const Message = await database.directMessages.create({
        data: {
          content: message,
          FileURL: "",
          ConversationId: conversation_id,
          SenderId: req.user_id,
          ReceiverId: receiver_id,
        },
        include: {
          Sender: true,
          Conversation: true,
          Receiver: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Message sent successfully",
        data: Message,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error while sending message in conversation",
      });
    }
  }
);

export default routes;
