import redis from "../Redis";

const StoreDataInRedis = async (Key_Identifier: string, Data_to_Store: any) => {
  try {
    await redis.set(Key_Identifier, JSON.stringify(Data_to_Store), "EX", 660);
  } catch (error) {
    console.log(error);
  }
};

const DeleteSpecificDataInRedis = async (Key_Identifier: string) => {
  try {
    const exist = await redis.exists(Key_Identifier);
    if (exist) {
      await redis.del(Key_Identifier);
    }
  } catch (error) {
    console.log(error);
  }
};

export { StoreDataInRedis, DeleteSpecificDataInRedis };
