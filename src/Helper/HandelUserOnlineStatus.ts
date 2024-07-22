import { configDotenv } from "dotenv";
configDotenv();
import jwt from "jsonwebtoken";
import { database } from "../database";

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
    await database.user.update({
      where: {
        id: user_id,
      },
      data: {
        Is_Online: User_Status,
      },
    });
    // Process the decoded token
  } catch (error) {
    console.log("error while updating user online status", error);
  }
}
export default Handel_User_Online_Status;
