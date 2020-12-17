import { MongoPubSub } from '../src/mongo-pubsub'


const pubSub = new MongoPubSub()


describe("subscribe", () => {
    let subId: number
    it('shoud listen when subscribed', async (done) => {
        const KEY = 'Posts'
        const Data = { text: 'Hello' }

        subId = await pubSub.subscribe(KEY, (message) => {
            expect(message.text).toBe(Data.text)
            done()
        })

        pubSub.publish(KEY, Data)


    })

    it('should unsubscribe', () => {
        pubSub.unsubscribe(subId)
    })

    afterAll(async (done) => {
        await pubSub.close()
        done()
    })
})

// import { MongoClient, Db } from 'mongodb'

// describe('insert', () => {
//     let connection: MongoClient
//     let db: Db

//     beforeAll(async () => {
//         connection = await MongoClient.connect(process.env.MONGO_URL!, {
//             useNewUrlParser: true,
//             useUnifiedTopology: true
//         })
//         db = await connection.db()
//     })

//     afterAll(async () => {
//         await connection.close()
//     })
//     it('should insert a doc into collection', async () => {
//         const users = db.collection('users')

//         const mockUser = { _id: 'some-user-id', name: 'John' }
//         await users.insertOne(mockUser)

//         const insertedUser = await users.findOne({ _id: 'some-user-id' })
//         expect(insertedUser).toEqual(mockUser)
//     })
// })