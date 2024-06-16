// importing the required modules
import { PrismaClient } from '@prisma/client'
import { configDotenv } from 'dotenv'




// configuring the prisma client
configDotenv()




declare global {
    var prisma: PrismaClient | undefined
}
export const database = global.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') global.prisma = database