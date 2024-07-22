import { configDotenv } from "dotenv";
configDotenv();
import jwt from "jsonwebtoken";

const CheckAuthToken = async (req: any, res: any, next: any) => {
  try {
    
    const AuthToken = req.headers["authorization"];
    if (!AuthToken) {
      return res
        .status(401)
        .json({ success: false, message: "User Don't have the AuthToken" });
    }
    const data: any = jwt.verify(
      AuthToken,
      process.env.JWT_SECRET_KEY as string
    );
    
    req.user_id = data.user_id;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "error while checking AuthToken" });
  }
};

export default CheckAuthToken;
