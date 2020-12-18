import { MongoPubSub } from '../src/mongo-pubsub'


const pubSub = new MongoPubSub()


const subIds: number[] = []
describe("subscribe", () => {
    const KEY = 'Posts'
    it('shoud listen when subscribed', async (done) => {
        const Data = { text: 'Hello' }

        const subId = await pubSub.subscribe(KEY, async (message) => {
            expect(message.text).toBe(Data.text)
            done()
        })

        subIds.push(subId)

        pubSub.publish(KEY, Data)

    })


    it('can publish to multiple listeners', async (done) => {
        const Data = { text: 'Hello There' }
        const KEY2 = 'THERE'
        const promises = [
            pubSub.subscribe(KEY2, (message) => {
                expect(message.text).toBe(Data.text)

            }),
            pubSub.subscribe(KEY2, (message) => {
                expect(message.text).toBe(Data.text)
            })
        ]
        const [id2, id3] = await Promise.all(promises)
        pubSub.publish(KEY2, Data)
        subIds.push(id2)
        subIds.push(id3)
        done()
    })
    it('should unsubscribe', () => {
        for (let id of subIds) {
            pubSub.unsubscribe(id)
        }

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