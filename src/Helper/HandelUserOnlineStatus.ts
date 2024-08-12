import { configDotenv } from "dotenv";
configDotenv();
import jwt from "jsonwebtoken";
import { database } from "../database";
import redis from "../Redis";
import { DeleteSpecificDataInRedis } from "./StorDataInRedis";

async function Handel_User_Online_Status(
  AuthToken: string,
  User_Status: boolean
) {
  try {
    if (!AuthToken) return;
    const DecodedToken: any = jwt.verify(
      AuthToken,
      process.env.JWT_SECRET_KEY as string
    );

    const { user_id } = DecodedToken;
    if (!user_id) return;
    const user = await database.user.findUnique({
      where: {
        id: user_id,
      },
      include: {
        channels: true,
        servers: true,
      },
    });
    const multiple_server_info = `multiple_server_info_${user_id}`;
    DeleteSpecificDataInRedis(multiple_server_info);
    if (!user?.servers) return;
    user?.servers.map((server: any) => {
      const single_server = `single_server_${server.id}`;
      DeleteSpecificDataInRedis(single_server);
    });
    if (User_Status) {
      await database.user.update({
        where: {
          id: user_id,
        },
        data: {
          Is_Online: true,
        },
      });
      await redis.del(user_id);
    } else {
      await database.user.update({
        where: {
          id: user_id,
        },
        data: {
          Is_Online: false,
        },
      });
      await redis.del(user_id);
    }

    // Process the decoded token
  } catch (error) {
    // console.log("error while updating user online status", error);
  }
}
export default Handel_User_Online_Status;
